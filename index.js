var fs = require('fs');
var crypto = require('crypto');
var CronJob = require('cron').CronJob;
var winston = require('winston');
var moment = require('moment-timezone');
var express = require('express');
var app = express();
var tr = require('./translations.json');
var activities = require('./activities.json');
var pers = require('./mfwbotcrashes.js');
var Discord = require('discord.js');
var bot = new Discord.Client({autoReconnect: true});

var MAX_MESSAGE_LENGTH = 1800;
var CRON_TIMING = '0 10,15 * * *';
var TIMEZONE = 'Pacific/Auckland';
var HOLIDAY_API = [ // xD
  '30-03-2018',
  '02-04-2018', '25-04-2018',
  '04-06-2018', '22-10-2018', '25-12-2018',
  '26-12-2018'
];

winston.configure({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' })
  ],
  exceptionHandlers: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'exception.log' })
  ]
});

bot.login(process.env.TOKEN).catch(function (msg) {
  winston.error(msg);
});

pers.init(function (err) {
  if (err) {
    winston.error(err);
    process.exit(1);
  }
  var channelsCron = pers.getAllChannels();
  for (var channel in channelsCron) {
    var oldJob = new CronJob({
      cronTime: CRON_TIMING,
      onTick: function () {
        postNewMessage(bot.channels.get(channelsCron[channel]), true);
      },
      start: false,
      timeZone: TIMEZONE
    });
    oldJob.start();
    winston.info('CronJob created for old channel ' + channelsCron[channel]);
  }

  bot.on('ready', function (event) {
    winston.info('Logged in as %s - %s\n', bot.user.username, bot.user.id);
    handleCurrentVersion();
  });

  bot.on('messageReactionAdd', function (messageReaction) {
    handleReaction(messageReaction);
  });

  bot.on('messageReactionRemove', function (messageReaction) {
    handleReaction(messageReaction);
  });

  var bytes;
  function getSecureRandomData () {
    if (!bytes || bytes.generated.isBefore(moment().subtract(10, 'minutes'))) {
      // New random bytes every hour
      bytes = {
        data: crypto.randomBytes(64).toString('hex'),
        generated: moment()
      };
    }

    return bytes.data;
  }

  /**
   * Gets the hash of the given user ID, this will remain the same for ten nimutes after the user
   * has posted allowing edits without persisting a user id that can be deduced.
   */
  function getHashedUid (uid) {
    var hash = crypto.createHash('sha256');
    hash.data(uid + getSecureRandomData());
    return hash.digest('hex');
  }

  function handleCurrentVersion (newChannelId) {
    fs.readFile('README.md', 'utf8', function (err, data) {
      if (err) throw err;
      var channels = pers.getAllChannels();
      var releaseNoteRegx = /(__\*\*(.*)\*\*__[^_]*)__\*\*/g;
      var releaseNoteResult = releaseNoteRegx.exec(data);
      var releaseNote = releaseNoteResult[1];
      var version = releaseNoteResult[2];
      if (newChannelId) {
        pers.setVersionText(newChannelId, releaseNote);
      } else {
        // Backup the db
        fs.createReadStream('./dmcdata.json').pipe(fs.createWriteStream('./' + 'backup_' + version.replace(/ /g, '_') + '.json'));
        // "Upgrade" all channels
        for (var channel in channels) {
          if (pers.getVersionText(channels[channel]) !== releaseNote) {
            pers.setVersionText(channels[channel], releaseNote);
            pers.performDataUpgrade(channels[channel], version);
            bot.channels.get(channels[channel]).send(tr.whatHappened + releaseNote);
          } else {
            winston.info('Version matches, skipping!');
          }
        }
      }
    });
  }

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

    if (msgContent.length > MAX_MESSAGE_LENGTH) {
      // Don't even read it, shoot back with a response and skip
      var shortenBy = msgContent.length - MAX_MESSAGE_LENGTH;
      var chars = ' character' + (shortenBy === 1 ? '' : 's');
      message.channel.send(tr.tooLong + (msgContent.length - MAX_MESSAGE_LENGTH) + chars + tr.tooLong2);
      return;
    }

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

    if (params === null) {
      // Something has gone terribly wrong. Return a message to the user, and log the error.
      winston.error('Failed to parse message with content ' + msgContent);
      message.channel.send(tr.uhOh);
      return;
    }

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
          return;
        } else if (paramCommands.dmc.includes(modifierParam) || paramCommands.spd.includes(modifierParam)) {
          // Handle DMC/SPD

          var shallow = modifierParam[0] === 's';
          for (var channel in channels) {
            pers.addQuestion(channels[channel], mainParam.slice(1, -1), getHashedUid(message.author.id), shallow, function () {});
          }

          // Respond to user appropriately
          message.channel.send(tr.questRec + (shallow ? 'SPD' : 'DMC') + tr.questRec2);

          // Handle cases where it's going to cause a prompt
          for (var toCheck in channels) {
            if (!pers.hasDailyQuestion(channels[toCheck]) && pers.getIsShallow(channels[toCheck]) === shallow && pers.getOnBreak(channels[toCheck]) === null) {
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
          message.channel.startTyping();
          setTimeout(function () {
            message.channel.send(tr.sadbois2);
            message.channel.stopTyping();
            userInfo.knowsSecret = true;
          }, 5000);
        });
      } else {
        message.channel.send(tr.noMatch);
      }
    });
  }

  bot.on('message', function (message) {
    if (!message.author.bot) {
      console.log(message.author.username + ' - ' + message.author.id + ' - ' + message.channel.id + ' - ' + message.content);
      if (message.channel instanceof Discord.DMChannel) {
        message.channel.startTyping();
        setTimeout(handleDirectMessage, 2000, message);
        message.channel.stopTyping();
      } else if (message.content === tr.introduceYourself) {
        message.channel.send(tr.dontPurge).then(function () {
          postNewMessage(message.channel, false);
        });
      } else if (message.content === tr.flip) {
        pers.getChannelInfo(message.channel.id, true, function (channelInfo) {
          if (channelInfo !== null) {
            pers.flipShallow(message.channel.id);
            message.channel.send(tr.barrel);
          }
        });
      }
    }
  });

  function daysTillWork () {
    var today = moment().tz(TIMEZONE);
    var formattedToday = today.format('DD-MM-YYYY');
    var dayToday = today.format('dddd');
    var daysTillWork = 0;
    while (true) { // monkaGun
      if (isTodayHoliday(formattedToday) || dayToday === 'Saturday' || dayToday === 'Sunday') {
        daysTillWork++;
        today.add(1, 'days');
        formattedToday = today.format('DD-MM-YYYY');
        dayToday = today.format('dddd');
      } else {
        break;
      }
    }
    return daysTillWork;
  }

  function isTodayHoliday (formattedDate) {
    // This will eventually need to be swapped out for an API call,
    // but this codebase has avoided async for a while, so if I were to add
    // it I'd want to make everything else promise-based as well.
    return HOLIDAY_API.includes(formattedDate);
  }

  function postNewMessage (channel, shouldFlip) {
    pers.getChannelInfo(channel.id, false, function (channelInfo, isNewChannel) {
      if (isNewChannel) {
        handleCurrentVersion(channel.id);
        var newJob = new CronJob({
          cronTime: CRON_TIMING,
          onTick: function () {
            postNewMessage(bot.channels.get(channel.id), true);
          },
          start: false,
          timeZone: TIMEZONE
        });
        newJob.start();
        winston.info('CronJob created for new channel ' + channel.id);
      }
      if (channelInfo.questionOfTheDay !== null) {
        channel.fetchMessage(channelInfo.questionOfTheDay).then(function (message) {
          if (message.pinned) {
            message.unpin();
          }
        });
      }

      // Handle holiday mode if a question hasn't been forced (indicated by a shouldFlip)
      if (shouldFlip) {
        // Check if they are currently on on break
        var onBreak = pers.getOnBreak(channel.id);
        if (onBreak === null) {
          // Dee not on break, check if she should be
          var days = daysTillWork();
          if (days !== 0) {
            var type = 'weekend';
            if (days === 1) {
              type = 'day-off';
            } else if (days > 2) {
              type = 'long-weekend';
            }
            var activityNum = pers.getActivityInfo(channel.id, type);
            var activity = activities[type][activityNum];
            if (activity === undefined) {
              activity = tr.defaultActivity;
            } else {
              activity = activity.activity;
            }
            channel.send(tr.breakTiem + tr[type] + activity + tr.cya);
            pers.setQuestionMessageId(channel.id, null, function () {});
            pers.setOnBreak(channel.id, type);
            return; // All done!
          } // else nothing to do
        } else {
          // Dee on break, check if she shouldn't be
          var daysLeft = daysTillWork();
          if (daysLeft === 0) {
            var activityCompletedNum = pers.getActivityInfo(channel.id, onBreak);
            var activityCompleted = activities[onBreak][activityCompletedNum];
            if (activityCompleted === undefined) {
              activityCompleted = tr.defaultOutcome;
            } else {
              activityCompleted = activityCompleted.outcome;
              pers.setActivityInfo(channel.id, onBreak, activityCompletedNum + 1);
            }
            channel.send(tr.imBack + activityCompleted);
            pers.setOnBreak(channel.id, null);
            // Continue with q asking
          } else {
            return;
          }
        }
      }

      pers.getNextQuestion(channel.id, false, function (question, shallow, hasNext) {
        if (question === null) {
          channel.send(tr.allOut).then(function (message) {
            pers.setQuestionMessageId(message.channel.id, null, function () {});
          });
        } else {
          var needQ = (hasNext === null) ? tr.noQTommorrow : '';
          channel.send('***Today\'s ' + (shallow ? 'shallow and pointless' : 'deep and meaningful') + ' question is: ***' + question.question + needQ).then(function (message) {
            message.react(channelInfo.upvoteId).then(function (reactionAdded) {
              message.react(channelInfo.downvoteId);
            });
            message.pin();
            pers.setQuestionMessageId(message.channel.id, message.id, function () {});
            pers.setAsked(message.channel.id, false);
          });
        }
      }, shouldFlip);
    });
  }
});

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
  response.send('Hello World!');
});

app.listen(app.get('port'), function () {
  console.log('Node app is running at localhost:' + app.get('port'));
});
