const L = require('lokijs'); // There are starving kids in Africa who could use those characters!
const tr = require('./translations.json'); // This is probably poor encapsulation, huh?
const winston = require('winston');

let initialised = false;
let db;

const init = function (callback) {
  if (initialised) return;
  initialised = true;
  db = new L('./dmcdata.json');

  db.loadDatabase({}, function (err) {
    if (err) {
      callback(err);
    } else {
      const collections = ['questions', 'shallow-questions', 'channelInfo', 'userInfo'];
      for (const collection in collections) {
        createCollection(db, collections[collection]);
      }
      db.saveDatabase(function (err) {
        if (err) {
          callback(err);
        } else {
          winston.info('Init worked, calling back.');
          callback();
        }
      });
    }
  });
};

function createCollection (db, name) {
  const collection = db.getCollection(name);
  if (!collection) {
    winston.info('Creating collection ' + name);
    db.addCollection(name);
  }
}

exports.init = init;

exports.performDataUpgrade = function (channelId, version) {
  const thisChannelInfo = db.getCollection('channelInfo').findOne({'channel': channelId});
  const logInfo = version + ' and channel ' + channelId;
  let noUpgrade = false;
  switch (version) {
    case 'Version 1.7':
      thisChannelInfo.onBreak = null;
      thisChannelInfo.activity = {
        'day-off': 0,
        'weekend': 0,
        'long-weekend': 0
      };
      break;
    case 'Version 1.5':
      thisChannelInfo.nextShallowQuestionToPostId = 1;
      thisChannelInfo.nextShallowQuestionToSaveId = 1;
      thisChannelInfo.isQuestionShallow = false;
      break;
    default:
      winston.info('No upgrade required for ' + logInfo);
      noUpgrade = true;
  }
  if (!noUpgrade) {
    winston.info('Upgrade performed for ' + logInfo);
    db.saveDatabase();
  }
};

exports.getChannelInfo = function (channelId, isCheck, callback) {
  const channelInfo = db.getCollection('channelInfo');
  const thisChannelInfo = channelInfo.findOne({'channel': channelId});
  if (!thisChannelInfo) {
    if (isCheck) {
      callback(null);
    } else {
      const newChannel = channelInfo.insert({
        'channel': channelId,
        'reactCount': 3,
        'downvoteId': '%E2%AC%87',
        'upvoteId': '%E2%AC%86',
        'questionOfTheDay': null,
        'nextQuestionToPostId': 1,
        'nextQuestionToSaveId': 1,
        'nextShallowQuestionToPostId': 1,
        'nextShallowQuestionToSaveId': 1,
        'isQuestionShallow': false,
        'onBreak': null,
        'activity': {
          'day-off': 0,
          'weekend': 0,
          'long-weekend': 0
        }
      });
      addQuestion(channelId, tr.aSimpleQ1, '<3', false, function () {
        db.saveDatabase(function (err) {
          if (err) {
            callback(err);
          } else {
            winston.info('Channel created successfully!');
            callback(newChannel, true);
          }
        });
      });
    }
  } else {
    callback(thisChannelInfo, false);
  }
};

const addQuestion = function (channelId, question, author, shallow, callback) {
  const questions = shallow ? db.getCollection('shallow-questions') : db.getCollection('questions');
  const thisChannelInfo = db.getCollection('channelInfo').findOne({'channel': channelId});
  questions.insert({
    'channel': channelId,
    'question': question,
    'author': author,
    'questionId': shallow ? thisChannelInfo.nextShallowQuestionToSaveId++ : thisChannelInfo.nextQuestionToSaveId++
  });
  db.saveDatabase(function (err) {
    if (err) {
      callback(err);
    } else {
      winston.info('Question saved successfully!');
      callback();
    }
  });
};

exports.addQuestion = addQuestion;

exports.getNextQuestion = function (channelId, check, callback, shouldFlip) {
  winston.info('Getting question for ' + channelId + ', with check as ' + check + ' and shouldFlip as ' + shouldFlip);
  const thisChannelInfo = db.getCollection('channelInfo').findOne({'channel': channelId});
  const shallow = shouldFlip ? !thisChannelInfo.isQuestionShallow : thisChannelInfo.isQuestionShallow;
  const questions = shallow ? db.getCollection('shallow-questions') : db.getCollection('questions');
  const questionId = shallow ? thisChannelInfo.nextShallowQuestionToPostId : thisChannelInfo.nextQuestionToPostId;
  const question = questions.findOne({'channel': channelId, 'questionId': questionId});
  const hasNext = questions.findOne({'channel': channelId, 'questionId': questionId + 1});
  if (!check && shouldFlip) { // Shouldn't really check and flip
    flipShallow(channelId);
  }
  if (question) {
    if (!check) {
      shallow ? thisChannelInfo.nextShallowQuestionToPostId++ : thisChannelInfo.nextQuestionToPostId++;
    }
    callback(question, shallow, hasNext);
  } else {
    callback(null);
  }
};

exports.getQuestionMessageId = function (channelId) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).questionOfTheDay;
};

exports.setQuestionMessageId = function (channelId, messageId, callback) {
  const thisChannelInfo = db.getCollection('channelInfo').findOne({'channel': channelId});
  thisChannelInfo.questionOfTheDay = messageId;
  db.saveDatabase(function (err) {
    if (err) {
      callback(err);
    } else {
      console.log('Daily question saved!');
      callback(messageId);
    }
  });
};

exports.getUserInfo = function (userId, callback) {
  const users = db.getCollection('userInfo');
  const user = users.findOne({'user': userId});
  if (user) {
    callback(user, true);
  } else {
    return callback(users.insert({
      'user': userId,
      'knowsSecret': false
    }), false);
  }
};

exports.getAllChannels = function () {
  return db.getCollection('channelInfo').find().map(function (document) {
    return document.channel;
  });
};

exports.hasDailyQuestion = function (channelId) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).questionOfTheDay !== null;
};

exports.getAsked = function (channelId) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).asked;
};

exports.setAsked = function (channelId, value) {
  db.getCollection('channelInfo').findOne({'channel': channelId}).asked = value;
  db.saveDatabase();
};

exports.getVersionText = function (channelId) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).versionText;
};

exports.setVersionText = function (channelId, value) {
  db.getCollection('channelInfo').findOne({'channel': channelId}).versionText = value;
  db.saveDatabase();
};

exports.getIsShallow = function (channelId) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).isQuestionShallow;
};

const flipShallow = function (channelId) {
  const thisChannelInfo = db.getCollection('channelInfo').findOne({'channel': channelId});
  thisChannelInfo.isQuestionShallow = !thisChannelInfo.isQuestionShallow;
  db.saveDatabase();
};

exports.flipShallow = flipShallow;

// Maybe we should clean this up as a generic getAttribute?

exports.getOnBreak = function (channelId) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).onBreak;
};

exports.setOnBreak = function (channelId, value) {
  db.getCollection('channelInfo').findOne({'channel': channelId}).onBreak = value;
  db.saveDatabase();
};

exports.getActivityInfo = function (channelId, activity) {
  return db.getCollection('channelInfo').findOne({'channel': channelId}).activity[activity];
};

exports.setActivityInfo = function (channelId, activity, value) {
  db.getCollection('channelInfo').findOne({'channel': channelId}).activity[activity] = value;
  db.saveDatabase();
};
