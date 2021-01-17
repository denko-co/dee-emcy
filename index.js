const fs = require('fs');
const CronJob = require('cron').CronJob;
const winston = require('winston');
const moment = require('moment-timezone');
const express = require('express');
const app = express();
const tr = require('./translations.json');
const activities = require('./activities.json');
const pers = require('./mfwbotcrashes.js');
const Discord = require('discord.js');
const bot = new Discord.Client({autoReconnect: true});

const MAX_MESSAGE_LENGTH = 1800;
const CRON_TIMING = '0 10,15 * * *';
const TIMEZONE = 'Pacific/Auckland';
const HOLIDAY_API = [ // xD
  '25-12-2020', '26-12-2020', '28-12-2020',
  '01-01-2021', '02-01-2021', '04-01-2021',
  '01-02-2021',
  '06-02-2021', '08-02-2021',
  '02-04-2021', '05-04-2021',
  '25-04-2021', '26-04-2021',
  '07-06-2021',
  '25-10-2021',
  '25-12-2021', '26-12-2021', '27-12-2021', '28-12-2021',
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
  const channelsCron = pers.getAllChannels();
  for (let channel in channelsCron) {
    const oldJob = new CronJob({
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

  function handleCurrentVersion (newChannelId) {
    fs.readFile('README.md', 'utf8', function (err, data) {
      if (err) throw err;
      const channels = pers.getAllChannels();
      const releaseNoteRegx = /(__\*\*(.*)\*\*__[^_]*)__\*\*/g;
      const releaseNoteResult = releaseNoteRegx.exec(data);
      const releaseNote = releaseNoteResult[1];
      const version = releaseNoteResult[2];
      if (newChannelId) {
        pers.setVersionText(newChannelId, releaseNote);
      } else {
        // Backup the db
        fs.createReadStream('./dmcdata.json').pipe(fs.createWriteStream('./' + 'backup_' + version.replace(/ /g, '_') + '.json'));
        // "Upgrade" all channels
        for (let channel in channels) {
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
    const message = messageReaction.message;
    const channelId = message.channel.id;
    pers.getChannelInfo(channelId, true, function (channelInfo) {
      // channelInfo = channelInfo.map(v => unescape(v) if typeof(v) === 'string');
      if (channelInfo !== null) {
        if (message.author.id === bot.user.id && pers.getQuestionMessageId(channelId) === message.id) {
          let diff = message.reactions.reduce(function (val, curr) {
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
    let msgContent = message.content;

    if (msgContent.length > MAX_MESSAGE_LENGTH) {
      // Don't even read it, shoot back with a response and skip
      const shortenBy = msgContent.length - MAX_MESSAGE_LENGTH;
      const chars = ' character' + (shortenBy === 1 ? '' : 's');
      message.channel.send(tr.tooLong + (msgContent.length - MAX_MESSAGE_LENGTH) + chars + tr.tooLong2);
      return;
    }

    const paramCommands = {
      answer: ['a', 'ans', 'answer', 'anon'],
      dmc: ['d', 'dmc'],
      spd: ['s', 'spd']
    };

    const paramCommandsDetails = {
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

    const nonParamCommands = {
      help: ['h', 'help']
    };

    const nonParamCommandsDetails = {
      help: {
        description: 'If you ever feel a bit stuck, or forget something (don\'t worry, happens to me too... more than I\'d like... >.>\'), send this to get this message again.',
        usage: '--help'
      }
    };

    function generateHelpText () {
      let helpText = '';
      helpText += tr.helpText1;
      helpText += '\n-----\n' + tr.helpText2;

      for (let ncommandId in nonParamCommands) {
        const ncommand = nonParamCommands[ncommandId];
        const ncommandDetails = nonParamCommandsDetails[ncommandId];
        helpText += '\n**' + ncommand.join(', ') + '** - ' + ncommandDetails.description + ' *For example:* `' + ncommandDetails.usage + '`\n';
      }

      helpText += '\n-----\n' + tr.helpText3;

      for (let commandId in paramCommands) {
        const command = paramCommands[commandId];
        const commandDetails = paramCommandsDetails[commandId];
        helpText += '\n**' + command.join(', ') + '** - ' + commandDetails.description + ' *For example:* `' + commandDetails.usage + '`\n';
      }

      helpText += '\n-----\n' + tr.helpText4;

      return helpText;
    }

    for (let i = 0; i < msgContent.length; i++) {
      if (msgContent.charAt(i) !== '-') {
        msgContent = msgContent.substring(i);
        break;
      }
    }

    // Whatever we have here will either have the leading dashes removed OR
    // be entirely -----, in which case it will get picked up later as invalid
    // I'd rather not have to pull that handling logic out for this one specific case

    // First, split it on the first whitespace, to see what bucket we need to check

    const paramReg = /^(\S*)\s*([\s\S]*)$/; // NON GLOBAL REGEX WEOW
    const params = paramReg.exec(msgContent);
    let validOld = false;

    if (params === null) {
      // Something has gone terribly wrong. Return a message to the user, and log the error.
      winston.error('Failed to parse message with content ' + msgContent);
      message.channel.send(tr.uhOh);
      return;
    }

    const modifierParam = params[1].toLowerCase();
    const mainParam = params[2];

    // Ready to rumble! Grab the current user, start parsing input.

    pers.getUserInfo(message.author.id, function (userInfo, wasThere) {
      const channels = pers.getAllChannels();

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

          for (let toSendAnon in channels) {
            bot.channels.get(channels[toSendAnon]).send(tr.aS + mainParam.slice(1, -1));
          }

          // Hope it's not anything lewd >:(
          message.channel.send(tr.secret);
          return;
        } else if (paramCommands.dmc.includes(modifierParam) || paramCommands.spd.includes(modifierParam)) {
          // Handle DMC/SPD

          const shallow = modifierParam[0] === 's';
          for (let channel in channels) {
            pers.addQuestion(channels[channel], mainParam.slice(1, -1), message.author.id, shallow, function () {});
          }

          // Respond to user appropriately
          message.channel.send(tr.questRec + (shallow ? 'SPD' : 'DMC') + tr.questRec2);

          // Handle cases where it's going to cause a prompt
          for (let toCheck in channels) {
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
      // console.log(message.author.username + ' - ' + message.author.id + ' - ' + message.channel.id + ' - ' + message.content);
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
    const today = moment().tz(TIMEZONE);
    let formattedToday = today.format('DD-MM-YYYY');
    let dayToday = today.format('dddd');
    let daysTillWork = 0;
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
        channel.fetchMessage(channelInfo.questionOfTheDay).then((message) => {
          if (message.pinned) {
            message.unpin();
          }
        });
      }

      // Handle holiday mode if a question hasn't been forced (indicated by a shouldFlip)
      if (shouldFlip) {
        // Check if they are currently on on break
        const onBreak = pers.getOnBreak(channel.id);
        if (onBreak === null) {
          // Dee not on break, check if she should be
          const days = daysTillWork();
          if (days !== 0) {
            let type = 'weekend';
            if (days === 1) {
              type = 'day-off';
            } else if (days > 2) {
              type = 'long-weekend';
            }
            const activityNum = pers.getActivityInfo(channel.id, type);
            let activity = activities[type][activityNum];
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
          const daysLeft = daysTillWork();
          if (daysLeft === 0) {
            const activityCompletedNum = pers.getActivityInfo(channel.id, onBreak);
            let activityCompleted = activities[onBreak][activityCompletedNum];
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
          const needQ = (hasNext === null) ? tr.noQTommorrow : '';
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
