const tr = require('./translations.json'); // This is probably poor encapsulation, huh?
const schema = require('./schema.json');
const database = require('./db.js');
const db_converter = require('./db_converter.js');
const winston = require('winston');

const channelInfoTableName = 'channelInfo';

let initialised = false;
let db;

// TODO: Remove dependence on questionId (for both shallow and deep question tables).

const init = function (callback) {
  if (initialised) {
    return;
  }
  initialised = true;

  // Initialize the database and create any tables which do not exist.
  db = new database.SqliteDatabase('./dmcdata.db', schema);
  callback();
};

exports.init = init;

exports.performDataUpgrade = function (oldDbName, newDbName) {
  winston.info(`Starting migration from ${oldDbName} to ${newDbName}.`)
  const converter = new db_converter.DatabaseConverter(oldDbName, newDbName);
  converter.run();
  winston.info(`Migrated database from ${oldDbName} to ${newDbName}.`);
};

exports.getChannelInfo = async function (channelId, isCheck, callback) {
  const thisChannelInfo = await db.findOne(channelInfoTableName, {'channel': channelId});
  if (!thisChannelInfo) {
    if (isCheck) {
      callback(null);
    } else {
      const newChannel = db.insert(channelInfoTableName, {
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
      addQuestion(channelId, tr.aSimpleQ1, 0, false, function () {
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

// TODO: Remove dependence on questionId (for both shallow and deep question tables).
// Currently, this relies on no questions being saved at the same time, to return correctly.
// Instead, this really should be using autoincrement.
const manuallyIncrement = async function(channelId, field) {
  const thisChannelInfo = await db.findOne(channelInfoTableName, {'channel': channelId});
  const questionId = thisChannelInfo[field];
  const newQuestionId = questionId + 1;

  const valueParam = {};
  valueParam[field] = value;
  db.update(channelInfoTableName, valueParam, {'channel': channelId});
  return questionId;
}

const addQuestion = async function (channelId, question, author, shallow, callback) {
  const questionTableName = shallow ? 'shallow-questions' : 'questions';
  const field = shallow ? 'nextShallowQuestionToSaveId' : 'nextQuestionToSaveId';
  const questionId = await manuallyIncrement(channelId, field);
  let err = await db.insert(questionTableName, {
    'channel': channelId,
    'question': question,
    'author': author,
    'questionId': questionId
  });
  if (err) {
    callback(err);
  } else {
    winston.info('Question saved successfully!');
    callback();
  }
};

exports.addQuestion = addQuestion;

exports.getNextQuestion = async function (channelId, check, callback, shouldFlip) {
  winston.info('Getting question for ' + channelId + ', with check as ' + check + ' and shouldFlip as ' + shouldFlip);
  const thisChannelInfo = await db.findOne('channelInfo', {'channel': channelId});
  const shallow = shouldFlip ? !thisChannelInfo.isQuestionShallow : thisChannelInfo.isQuestionShallow;
  const field = shallow ? 'nextShallowQuestionToPostId' : 'nextQuestionToPostId';
  const questionId = thisChannelInfo[field];
  const questionTableName = shallow ? 'shallow-questions' : 'questions';
  const question = db.findOne(questionTableName, {'channel': channelId, 'questionId': questionId});
  const hasNext = db.findOne(questionTableName, {'channel': channelId, 'questionId': questionId + 1});
  if (!check && shouldFlip) { // Shouldn't really check and flip
    flipShallow(channelId);
  }
  if (question) {
    if (!check) {
      await manuallyIncrement(channelId, field);
    }
    callback(question, shallow, hasNext);
  } else {
    callback(null);
  }
};

exports.getQuestionMessageId = function (channelId) {
  return db.findOne(channelInfoTableName, {'channel': channelId}).questionOfTheDay;
};

exports.setQuestionMessageId = async function (channelId, messageId, callback) {
  const err = await db.update(channelInfoTableName, {'questionOfTheDay': messageId}, {'channel': channelId}); 
  if (err) {
    callback(err);
  } else {
    console.log('Daily question saved!');
    callback(messageId);
  }
};

exports.getUserInfo = async function (userId, callback) {
  const userTableName = 'userInfo';
  const user = users.findOne(userTableName, {'user': userId});
  if (user) {
    callback(user, true);
  } else {
    const err = await db.insert(userTableName, {
      'user': userId,
      'knowsSecret': false
    });
    return callback(err, false);
  }
};

exports.getAllChannels = async function () {
  const dataOrErr = await db.find(channelInfoTableName);
  if (!dataOrErr) {
    winston.error(dataOrErr);
    return dataOrErr;
  }
  return dataOrErr.map((document) => {
    return document.channel;
  });
};

exports.hasDailyQuestion = function (channelId) {
  return db.findOne(channelInfoTableName, {'channel': channelId}).questionOfTheDay !== null;
};

exports.getAsked = function (channelId) {
  return db.findOne(channelInfoTableName, {'channel': channelId}).asked;
};

exports.setAsked = function (channelId, value) {
  db.update(channelInfoTableName, {'asked': value}, {'channel': channelId});
};

exports.getVersionText = function (channelId) {
  return db.findOne(channelInfoTableName, {'channel': channelId}).versionText;
};

exports.setVersionText = function (channelId, value) {
  db.update(channelInfoTableName, {'versionText': value}, {'channel': channelId});
};

exports.getIsShallow = function (channelId) {
  return db.findOne(channelInfoTableName, {'channel': channelId}).isQuestionShallow;
};

const flipShallow = async function (channelId) {
  const shallow = await db.findOne(channelInfoTableName, {'channel': channelId}).isQuestionShallow;
  db.update(channelInfoTableName, {'isQuestionShallow': shallow}, {'channel': channelId});
};

exports.flipShallow = flipShallow;

// Maybe we should clean this up as a generic getAttribute?

exports.getOnBreak = function (channelId) {
  return db.findOne(channelInfoTableName, {'channel': channelId}).onBreak;
};

exports.setOnBreak = function (channelId, value) {
  db.findOne(channelInfoTableName, {'channel': channelId}).onBreak = value;
  db.saveDatabase();
};

exports.getActivityInfo = function (channelId, activity) {
  const activityName = 'activity_' + activity;
  return db.findOne(channelInfoTableName, {'channel': channelId})[activityName];
};

exports.setActivityInfo = function (channelId, activity, value) {
  const activityName = 'activity_' + activity;
  db.update(channelInfoTableName, {activityName: value}, {'channel': channelId});
};
