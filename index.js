var express = require('express');
var cron = require('node-cron');
var app = express();
var tr = require('./translations.json');
var Discord = require('discord.js');
var bot = new Discord.Client({autoReconnect: true});

bot.login(process.env.TOKEN);

var bestBuds = {};
var qOfTheDay = '';
var questions = [
  {
    question: tr.aSimpleQ1,
    author: '<3'
  },
  {
    question: tr.aSimpleQ2,
    author: '<3'
  },
  {
    question: tr.aSimpleQ3,
    author: '<3'
  },
  {
    question: tr.aSimpleQ4,
    author: '<3'
  }
]; // loop this eventually
var DMC_CHANNEL = '391773086267211776';
var REACT_COUNT = 4;
var DOWNVOTE_ID = '%E2%AC%87';
var UPVOTE_ID = '%E2%AC%86';


cron.schedule('0 11 * * *', function () {
  deletThis(bot.channels.get(DMC_CHANNEL)).then(postNewMessage(bot.channels.get(DMC_CHANNEL)));
});

bot.on('ready', function (event) {
  console.log('Logged in as %s - %s\n', bot.user.username, bot.user.id);
});

bot.on('messageReactionAdd', function (messageReaction) {
  var message = messageReaction.message;
  if (message.author.id === bot.user.id && message.content === '***Today\'s question is: ***' + qOfTheDay) {

    if (messageReaction.count === REACT_COUNT && messageReaction.emoji.identifier === DOWNVOTE_ID) {
      postNewMessage(message.channel);
    }
  }
});

bot.on('message', function (message) {
  // var channelID = message.channel.id.toString()
  if (!message.author.bot) {
    console.log(message.author.username + ' - ' + message.author.id + ' - ' + message.channel.id + ' - ' + message.content);
    if (message.channel instanceof Discord.DMChannel) {
      setTimeout(function () {
        message.channel.startTyping();
        setTimeout(function () {
          if (message.author.id in bestBuds) {
            var user = bestBuds[message.author.id];

            var questionRegx = /".*?"/g;
            var toSave;
            var found = 0;
            while ((toSave = questionRegx.exec(message.content)) !== null) {
              found++;
              questions.push({
                question: toSave[0].slice(1, -1),
                author: message.author.id
              });
              console.log(toSave[0]);
            }
            if (found === 0) {
              if (!user.knowsSecret) {
                message.channel.send(tr.sadbois).then(function () {
                  message.channel.startTyping();
                  setTimeout(function () {
                    message.channel.send(tr.sadbois2);
                    user.knowsSecret = true;
                    message.channel.stopTyping();
                  }, 5000);
                })
              } else {
                message.channel.send('...  :3');
              }
            } else {
              if (found > 1) {
                message.channel.send(tr.questRec2);
              } else {
                message.channel.send(tr.questRec);
              }
            }
          } else {
            bestBuds[message.author.id] = {
              knowsSecret: false
            };
            message.channel.send(tr.greetingsUser);
          }
        }, 2000);
        message.channel.stopTyping();
      }, 500);
      return;
    }

    if (message.content === tr.introduceYourself && message.channel.id === DMC_CHANNEL) {
      message.channel.send(tr.dontPurge).then(function () {
        postNewMessage(message.channel);
      })
    }
  }
})

function postNewMessage (channel) {
  if (questions.length === 0) {
    channel.send(tr.allOut);
  } else {
    qOfTheDay = questions.shift().question;
    channel.send('***Today\'s question is: ***' + qOfTheDay).then(function (message) {
      message.react(UPVOTE_ID);
      message.react(DOWNVOTE_ID);
      message.pin();
    });
  }
}

function deletThis (channel) {
  return channel.fetchMessages({limit: 100}).then(function (messages) {
    messages = messages.filter(function (ele) {
      return !(ele.content === tr.dontPurge && ele.author.id === bot.user.id);
    })
    var toDelete = messages.array().length;
    if (toDelete !== 0) {
      console.log('I\'ve got ' + toDelete + ' messages! Wow!');
      if (toDelete === 1) {
        postNewMessage(channel);
        return messages.first().delete();
      }
      return channel.bulkDelete(messages).then(function () {
        console.log('Going again!')
        deletThis(channel)
      });
    } else {
      postNewMessage(channel);
    }
  });
}

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
  response.send('Hello World!');
});

app.listen(app.get('port'), function () {
  console.log('Node app is running at localhost:' + app.get('port'));
});
