var fs = require('fs');
var cron = require('node-cron');
var express = require('express');
var app = express();
var tr = require('./translations.json');
var pers = require('./mfwbotcrashes.js');
var Discord = require('discord.js');
var bot = new Discord.Client({autoReconnect: true});
var winston = require('winston');
winston.configure({
  level: 'info',
  transports: [
    new (winston.transports.File)({ filename: 'errors.log' })
  ]
});
winston.handleExceptions(new winston.transports.File({ filename: 'exception.log' }));

bot.login(process.env.TOKEN).catch(msg => {
  winston.error(msg);
});

pers.init(function (err) {
  if (err) {
    winston.error(err);
    process.exit(1);
  }
  var channelsCron = pers.getAllChannels();
  for (var channel in channelsCron) {
    cron.schedule('0 2,21 * * *', function () {
      postNewMessage(bot.channels.get(channelsCron[channel]), true);
    });
  }

  bot.on('ready', function (event) {
    winston.info('Logged in as %s - %s\n', bot.user.username, bot.user.id);
    fs.readFile('README.md', 'utf8', function (err, data) {
      if (err) throw err;
      var channels = pers.getAllChannels();
      var releaseNoteRegx = /(__\*\*.*\*\*__[^_]*)__\*\*/g;
      var releaseNote = releaseNoteRegx.exec(data)[1];
      for (var channel in channels) {
        if (pers.getVersionText(channels[channel]) !== releaseNote) {
          pers.setVersionText(channels[channel], releaseNote);
          pers.performDataUpgrade(channels[channel]);
          bot.channels.get(channels[channel]).send(tr.whatHappened + releaseNote);
        } else {
          winston.info('Version matches, skipping!');
        }
      }
    });
  });

  bot.on('messageReactionAdd', function (messageReaction) {
    handleReaction(messageReaction);
  });

  bot.on('messageReactionRemove', function (messageReaction) {
    handleReaction(messageReaction);
  });

  function handleReaction (messageReaction) {
    var message = messageReaction.message;
    var channelId = message.channel.id;
    pers.getChannelInfo(channelId, true, function (channelInfo) {
      if (channelInfo !== null) {
        if (message.author.id === bot.user.id && pers.getQuestionMessageId(channelId) === message.id) {
          var diff = message.reactions.reduce(function (val, curr) {
            if (curr.emoji.identifier === channelInfo.upvoteId) {
              val -= curr.count;
            } else if (curr.emoji.identifier === channelInfo.downvoteId) {
              val += curr.count;
            }
            return val;
          }, 0);
          // Flip votes if asking to cycle
          diff = pers.getAsked(channelId) ? diff * -1 : diff;
          if (diff === channelInfo.reactCount) {
            postNewMessage(message.channel, false);
          }
        }
      }
    });
  }

  function handleDirectMessage (message) {
    var msgContent = message.content;

    var paramCommands = {
      answer: ['a', 'ans', 'answer', 'anon'],
      dmc: ['d', 'dmc'],
      spd: ['s', 'spd']
    };

    var paramCommandsDetails = {
      answer: {
        description: 'If you\'re feeling a bit shy, if you send it to me, I can post it on your behalf.',
        usage: 'answer "Hey! I think you\'re really cool!"'
      },
      dmc: {
        description: 'If you\'ve got something deep and meaningful you\'d like to ask, send it to me like this, and I\'ll post it! (eventually! :P)',
        usage: 'dmc "Would you go back and redo everything, if you could?"'
      },
      spd: {
        description: 'If you\'ve got something a bit more lighthearted to discuss, that\'s okies too! ^^ I will post that one morning as well.',
        usage: 'spd "How many holes does a straw have, one or two?"'
      }
    };

    var nonParamCommands = {
      help: ['h', 'help']
    };

    var nonParamCommandsDetails = {
      help: {
        description: 'If you ever feel a bit stuck, or forget something (don\'t worry, happens to me too... more than I\'d like... >.>\'), send this to get this message again.',
        usage: '--help'
      }
    };

    function generateHelpText () {
      var helpText = '';
      helpText += tr.helpText1;
      helpText += '\n-----\n' + tr.helpText2;

      for (var ncommandId in nonParamCommands) {
        var ncommand = nonParamCommands[ncommandId];
        var ncommandDetails = nonParamCommandsDetails[ncommandId];
        helpText += '\n**' + ncommand.join(', ') + '** - ' + ncommandDetails.description + ' *For example:* `' + ncommandDetails.usage + '`\n';
      }

      helpText += '\n-----\n' + tr.helpText3;

      for (var commandId in paramCommands) {
        var command = paramCommands[commandId];
        var commandDetails = paramCommandsDetails[commandId];
        helpText += '\n**' + command.join(', ') + '** - ' + commandDetails.description + ' *For example:* `' + commandDetails.usage + '`\n';
      }

      helpText += '\n-----\n' + tr.helpText4;

      return helpText;
    }

    for (var i = 0; i < msgContent.length; i++) {
      if (msgContent.charAt(i) !== '-') {
        msgContent = msgContent.substring(i);
        break;
      }
    }

    // Whatever we have here will either have the leading dashes removed OR
    // be entirely -----, in which case it will get picked up later as invalid
    // I'd rather not have to pull that handling logic out for this one specific case

    // First, split it on the first whitespace, to see what bucket we need to check

    var paramReg = /^(\S*)\s*([\s\S]*)$/; // NON GLOBAL REGEX WEOW
    var params = paramReg.exec(msgContent);
    var validOld = false;
    var modifierParam = params[1].toLowerCase();
    var mainParam = params[2];

    // Ready to rumble! Grab the current user, start parsing input.

    pers.getUserInfo(message.author.id, function (userInfo, wasThere) {
      var channels = pers.getAllChannels();

      // Check if second param is empty, if so, run non-param checkLoops
      if (mainParam === '') {
        if (nonParamCommands.help.includes(modifierParam)) {
          // Handle help
          message.channel.send(generateHelpText());
          message.channel.stopTyping();
          return;
        }
      } else if (mainParam.length > 2 && mainParam[0] === '"' && mainParam[mainParam.length - 1] === '"') {
        if (paramCommands.answer.includes(modifierParam)) {
          // Handle answer

          // Send through to all listening channels as anon. Should take a channel param in future,
          // once we decide how that will work generally for all denko-co apps.

          for (var toSendAnon in channels) {
            bot.channels.get(channels[toSendAnon]).send(tr.aS + mainParam.slice(1, -1));
          }

          // Hope it's not anything lewd >:(
          message.channel.send(tr.secret);
          message.channel.stopTyping();
          return;
        } else if (paramCommands.dmc.includes(modifierParam) || paramCommands.spd.includes(modifierParam)) {
          // Handle DMC/SPD

          var shallow = modifierParam[0] === 's';
          for (var channel in channels) {
            pers.addQuestion(channels[channel], mainParam.slice(1, -1), message.author.id, shallow, function () {});
          }

          // Respond to user appropriately
          message.channel.send(tr.questRec + (shallow ? 'SPD' : 'DMC') + tr.questRec2);

          // Handle cases where it's going to cause a prompt
          for (var toCheck in channels) {
            if (!pers.hasDailyQuestion(channels[toCheck]) && pers.getIsShallow(channels[toCheck]) === shallow) {
              bot.channels.get(channels[channel]).send(tr.aNewQ).then(function (message) {
                pers.getChannelInfo(channels[channel], true, function (channelInfo) {
                  message.react(channelInfo.upvoteId).then(function (reactionAdded) {
                    message.react(channelInfo.downvoteId);
                  });
                  pers.setQuestionMessageId(message.channel.id, message.id, function () {});
                  pers.setAsked(channels[channel], true);
                });
              });
            }
          }

          // All done!
          message.channel.stopTyping();
          return;
        }
      } else {
        // Command is garbage, check if it was good before the patch
        if (/".*"/.test(msgContent)) {
          validOld = true; // validOld = !validOld xD
        }
      }

      // Handle things which aren't commands
      // Could do this in the else block above, prefer to be out 1 lvl of indent.
      if (!wasThere) {
        message.channel.send(generateHelpText());
      } else if (validOld) {
        message.channel.send(tr.oldFormat);
      } else if (!userInfo.knowsSecret) {
        message.channel.send(tr.sadbois).then(function () {
          setTimeout(function () {
            message.channel.send(tr.sadbois2);
            userInfo.knowsSecret = true;
          }, 5000);
        });
      } else {
        message.channel.send(tr.noMatch);
      }
    });
    message.channel.stopTyping(); // Always clean up!
  }

  bot.on('message', function (message) {
    if (!message.author.bot) {
      console.log(message.author.username + ' - ' + message.author.id + ' - ' + message.channel.id + ' - ' + message.content);
      if (message.channel instanceof Discord.DMChannel) {
        message.channel.startTyping();
        setTimeout(handleDirectMessage, 2000, message);
        return;
      }
      if (message.content === tr.introduceYourself) {
        message.channel.send(tr.dontPurge).then(function () {
          postNewMessage(message.channel, false);
        });
      }
      if (message.content === tr.flip) {
        pers.getChannelInfo(message.channel.id, true, function (channelInfo) {
          if (channelInfo !== null) {
            pers.flipShallow(message.channel.id);
            message.channel.send(tr.barrel);
          }
        });
      }
    }
  });

  function postNewMessage (channel, shouldFlip) {
    pers.getChannelInfo(channel.id, false, function (channelInfo, isNewChannel) {
      if (isNewChannel) {
        cron.schedule('0 2,21 * * *', function () {
          postNewMessage(bot.channels.get(channel.id), true);
        });
      }
      if (channelInfo.questionOfTheDay !== null) {
        channel.fetchMessage(channelInfo.questionOfTheDay).then(function (message) {
          if (message.pinned) {
            message.unpin();
          }
        });
      }
      pers.getNextQuestion(channel.id, false, function (question, shallow) {
        if (question === null) {
          channel.send(tr.allOut).then(function (message) {
            pers.setQuestionMessageId(message.channel.id, null, function () {});
          });
        } else {
          pers.getNextQuestion(channel.id, true, function (nextQ) {
            var needQ = (nextQ === null) ? tr.noQTommorrow : '';
            channel.send(`***Today's ${shallow ? 'shallow and pointless' : 'deep and meaningful'} question is: ***` + question.question + needQ).then(function (message) {
              message.react(channelInfo.upvoteId).then(function (reactionAdded) {
                message.react(channelInfo.downvoteId);
              });
              message.pin();
              pers.setQuestionMessageId(message.channel.id, message.id, function () {});
              pers.setAsked(message.channel.id, false);
            });
          }, false);
        }
      }, shouldFlip);
    });
  }

  /*
  CURRENTLY UNUSED, DON'T LOSE THIS THOUGH
  function deletThis (channel) {
    return channel.fetchMessages({limit: 100}).then(function (messages) {
      messages = messages.filter(function (ele) {
        return !(ele.content === tr.dontPurge && ele.author.id === bot.user.id);
      });
      var toDelete = messages.array().length;
      if (toDelete !== 0) {
        console.log('I\'ve got ' + toDelete + ' messages! Wow!');
        if (toDelete === 1) {
          postNewMessage(channel);
          return messages.first().delete();
        }
        return channel.bulkDelete(messages).then(function () {
          console.log('Going again!');
          deletThis(channel);
        });
      } else {
        postNewMessage(channel);
      }
    });
  }
  */
});

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
  response.send('Hello World!');
});

app.listen(app.get('port'), function () {
  console.log('Node app is running at localhost:' + app.get('port'));
});
