'use strict';
var CronJob = require('cron').CronJob;
var moment = require('moment');
var client = require('../esConnection.js');
var bulk = [];
var app = require('../server');
var loopback = require('../../node_modules/loopback/lib/loopback');
var path = require('path');

module.exports = function setupCron(server) {

    var makebulk = function(modelInstances, modelName, typeDifferentiator, callback){
        bulk = [];
        for (var current in modelInstances){
            var typeValue = typeDifferentiator === 'none'? modelName: modelInstances[current][typeDifferentiator];
            bulk.push(
                // {action: {metadata}}
                { index: {_index: app.get('uniqueDeveloperCode') + '_' + modelName, _type: typeValue, _id: modelInstances[current].id } },
                modelInstances[current]
            );
        }
        callback(bulk);
    };

    var indexall = function(madebulk, modelName, callback) {
        client.bulk({
            maxRetries: 5,
            body: madebulk
        },function(err,resp,status) {
            if (err) {
                console.log(err);
            }
            else {
                callback(resp.items);
            }
        })
    };

    // Setup cron to index data on ES
    var indexingJob = new CronJob('00 00 * * * *', function() {

        console.log("Running indexing cron job every hour.");

        // Index all peers
        server.models.peer.find({include: 'profiles'}, function (err, peerInstances) {
            makebulk(peerInstances, 'peer', 'none', function(response){
                console.log("Indexing Peers: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'peer', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all collections
        server.models.collection.find(function (err, collectionInstances) {
            makebulk(collectionInstances, 'collection', 'type', function(response){
                console.log("Indexing Collections: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'collection', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all contents
        server.models.content.find(function (err, contentInstance) {
            makebulk(contentInstance, 'content', 'type', function(response){
                console.log("Indexing Contents: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'content', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all topics
        server.models.topic.find(function (err, topicInstances) {
            makebulk(topicInstances, 'topic', 'none', function(response){
                console.log("Indexing Topics: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'topic', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all contacts
        server.models.contact.find(function (err, contactInstances) {
            makebulk(contactInstances, 'contact', 'provider', function(response){
                console.log("Indexing Contacts: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'contact', function(response){
                        console.log(response);
                    });
                }
            });
        });

    }, function() {
        // Callback function when job ends.
    },
    true,
    'UTC'
    );

    // Runs once every 24 hours
    var collectionCompleteCron = new CronJob('00 00 00 * * *',
        function() {
            server.models.collection.find({'where': {'status': 'active'}, 'include': ['calendars', 'participants', {'owners': 'profiles'}]}, function(err, collectionInstances){
               collectionInstances.forEach(collection => {
                   if (collection.toJSON().calendars !== undefined) {
                       collection.toJSON().calendars.forEach(calendar => {
                           var collectionCalendarEndDate = moment(calendar.endDate);
                           var collectionCalendarStartDate = moment(calendar.startDate);
                           var now = moment();
                           if (calendar.status !== 'complete' && collectionCalendarEndDate.diff(now) <= 0) {
                               //console.log('Collection ' + collection.title + ' - cohort ending ' + calendar.endDate + ' is completed. Send out emails to student and teacher');
                               // Mark the calendar as complete
                               var newCalendar = calendar;
                               newCalendar.status = 'complete';
                               server.models.calendar.upsertWithWhere({id: calendar.id}, newCalendar, function(err, updatedCalendarInstance) {
                                  if (err) {
                                      console.log('Could not mark calendar as complete. Error: ' + err);
                                  }
                                  else {
                                      console.log('Marked calendar as complete');
                                  }
                               });

                               // Get all students of this calendar
                               collection.__get__participants({'relWhere': {'calendarId': calendar.id}, 'include': 'profiles'}, function(err, participantInstances){
                                   if (!err && participantInstances.length > 0) {
                                       participantInstances.forEach(participantInstance => {
                                           // Send email to student asking to review the teacher
                                           var message = { type: collection.type, owner: collection.toJSON().owners[0].profiles[0].first_name + ' ' + collection.toJSON().owners[0].profiles[0].last_name, collectionId: collection.id, calendarId: calendar.id};
                                           var renderer = loopback.template(path.resolve(__dirname, '../../server/views/reviewReminderEmailStudent.ejs'));
                                           var html_body = renderer(message);
                                           loopback.Email.send({
                                               to: participantInstance.email,
                                               from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                               subject: 'Write a review for ' + collection.toJSON().owners[0].profiles[0].first_name + ' ' + collection.toJSON().owners[0].profiles[0].last_name,
                                               html: html_body
                                           })
                                               .then(function (response) {
                                                   console.log('email sent! - ');
                                               })
                                               .catch(function (err) {
                                                   console.log('email error! - ' + err);
                                               });
                                           // Send cohort completion summary to student
                                           message = { type: collection.type, viewTime: '', days: '', viewTimeComparison: '', viewTimePercentile: '', contentCount: '', contentSplit: '', totalCommentCount: '', personalCommentCount: '', topics: '', collectionId: collection.id, calendarId: calendar.id};
                                           renderer = loopback.template(path.resolve(__dirname, '../../server/views/cohortCompletionSummaryStudent.ejs'));
                                           html_body = renderer(message);
                                           loopback.Email.send({
                                               to: participantInstance.email,
                                               from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                               subject: 'Your summary for ' + collection.title,
                                               html: html_body
                                           })
                                               .then(function (response) {
                                                   console.log('email sent! - ');
                                               })
                                               .catch(function (err) {
                                                   console.log('email error! - ' + err);
                                               });
                                           // Send notification to student asking to review teacher

                                       });
                                   }
                               });

                               // Send email to teacher asking to review all students
                               var message = { type: collection.type, title: collection.title, collectionId: collection.id, calendarId: calendar.id};
                               var renderer = loopback.template(path.resolve(__dirname, '../../server/views/reviewReminderEmailTeacher.ejs'));
                               var html_body = renderer(message);
                               loopback.Email.send({
                                   to: collection.toJSON().owners[0].email,
                                   from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                   subject: 'Write a review for your students',
                                   html: html_body
                               })
                                   .then(function (response) {
                                       console.log('email sent! - ');
                                   })
                                   .catch(function (err) {
                                       console.log('email error! - ' + err);
                                   });
                               // Send cohort completion summary to teacher
                               message = { type: collection.type, viewTime: '', days: '', participantCount: '', participantCompletionRatio: '', contentCount: '', contentSplit: '', totalCommentCount: '', personalCommentCount: '', topics: '', collectionId: collection.id, calendarId: calendar.id};
                               renderer = loopback.template(path.resolve(__dirname, '../../server/views/cohortCompletionSummaryTeacher.ejs'));
                               html_body = renderer(message);
                               loopback.Email.send({
                                   to: collection.toJSON().owners[0].email,
                                   from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                   subject: 'Your summary for ' + collection.title,
                                   html: html_body
                               })
                                   .then(function (response) {
                                       console.log('email sent! - ');
                                   })
                                   .catch(function (err) {
                                       console.log('email error! - ' + err);
                                   });
                               // Send notification to teacher asking to review students
                               // Initiate payouts to teacher
                           }

                           // Get upcoming cohorts starting the next day
                           if (calendar.status !== 'complete' && collectionCalendarStartDate.isBetween(now, collectionCalendarStartDate.add(1, 'days'))) {

                               // Get all students of this calendar
                               collection.__get__participants({'relWhere': {'calendarId': calendar.id}, 'include': 'profiles'}, function(err, participantInstances){
                                   if (!err && participantInstances.length > 0) {
                                       participantInstances.forEach(participantInstance => {
                                           // Send email to student reminding of upcoming cohort
                                           var message = { type: collection.type, title: collection.title, startDate: collectionCalendarStartDate.format('DD MMM'), endDate: collectionCalendarEndDate.format('DD MMM'), owner: collection.toJSON().owners[0].profiles[0].first_name + ' ' + collection.toJSON().owners[0].profiles[0].last_name, collectionId: collection.id, calendarId: calendar.id};
                                           var renderer = loopback.template(path.resolve(__dirname, '../../server/views/upcomingCohortReminderStudent.ejs'));
                                           var html_body = renderer(message);
                                           loopback.Email.send({
                                               to: participantInstance.email,
                                               from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                               subject: 'Upcoming ' + collection.type + ' -- ' + collection.title,
                                               html: html_body
                                           })
                                               .then(function (response) {
                                                   console.log('email sent! - ');
                                               })
                                               .catch(function (err) {
                                                   console.log('email error! - ' + err);
                                               });

                                       });
                                   }
                               });

                               // Send email to teacher reminding of upcoming cohort
                               message = { type: collection.type, title: collection.title, startDate: collectionCalendarStartDate.format('DD MMM'), endDate: collectionCalendarEndDate.format('DD MMM'), owner: collection.toJSON().owners[0].profiles[0].first_name + ' ' + collection.toJSON().owners[0].profiles[0].last_name, collectionId: collection.id, calendarId: calendar.id};
                               renderer = loopback.template(path.resolve(__dirname, '../../server/views/upcomingCohortReminderTeacher.ejs'));
                               html_body = renderer(message);
                               loopback.Email.send({
                                   to: collection.toJSON().owners[0].email,
                                   from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                   subject: 'Upcoming ' + collection.type + ' cohort -- ' + collection.title,
                                   html: html_body
                               })
                                   .then(function (response) {
                                       console.log('email sent! - ');
                                   })
                                   .catch(function (err) {
                                       console.log('email error! - ' + err);
                                   });
                           }
                       });
                   }
               });
            });
        },
        function() {

    },
        true,
        'UTC'
    );

    // Runs once every 10 minutes
    var upcomingActivityCron = new CronJob('00 */10 * * * *',
        function() {
            server.models.collection.find({'where': {'status': 'active'}, 'include': [{'contents': ['schedules', 'locations', 'submissions']}, 'calendars', {'owners': 'profiles'}]}, function(err, collectionInstances){
                collectionInstances.forEach(collection => {
                    if (collection.calendars !== undefined) {
                        collection.toJSON().calendars.forEach(calendar => {
                            var collectionCalendarStartDate = moment(calendar.startDate);
                            var collectionCalendarEndDate = moment(calendar.endDate);
                            var now = moment();
                            if (calendar.status !== 'complete' && now.isBetween(collectionCalendarStartDate, collectionCalendarEndDate)) {
                                // This collection has a currently running calendar
                                // Check if it has any upcoming activity
                                collection.toJSON().contents.forEach(content => {
                                    var schedules = content.schedules;
                                    var scheduleData = schedules[0];
                                    if (scheduleData.startDay !== null && scheduleData.endDay !== null) {
                                        var startDate = moment(calendar.startDate).add(scheduleData.startDay, 'days');
                                        var endDate = moment(startDate).add(scheduleData.endDay, 'days');
                                        if (scheduleData.startTime && scheduleData.endTime) {
                                            startDate.hours(scheduleData.startTime.split('T')[1].split(':')[0]);
                                            startDate.minutes(scheduleData.startTime.split('T')[1].split(':')[1]);
                                            startDate.seconds('00');
                                            endDate.hours(scheduleData.endTime.split('T')[1].split(':')[0]);
                                            endDate.minutes(scheduleData.endTime.split('T')[1].split(':')[1]);
                                            endDate.seconds('00');
                                            console.log('Activity ' + content.title + ' time to start is: ' + startDate.diff(now, 'minutes') + ' minutes');
                                            if ((content.type !== 'video') && startDate.diff(now, 'minutes') >= 60 && startDate.diff(now, 'minutes') < 70) {
                                                // Upcoming online session starts in 1 hour. Send notification and email to all participants
                                                collection.__get__participants({'relWhere': {'calendarId': calendar.id}, 'include': 'profiles'}, function(err, participantInstances){
                                                    if (!err && participantInstances.length > 0) {
                                                        participantInstances.forEach(participantInstance => {
                                                            console.log('Sending notification to participant ' + participantInstance.toJSON().profiles[0].first_name + ' ' + participantInstance.toJSON().profiles[0].last_name + ' of ' + collection.title + ' for activity: ' + content.title);
                                                            // Send email to student
                                                            var message = { title: content.title, time: startDate.format('hh:mm a'), type: collection.type, collectionId: collection.id, calendarId: calendar.id, contentId: content.id};
                                                            var renderer;
                                                            if (content.type === 'online') {
                                                                renderer = loopback.template(path.resolve(__dirname, '../../server/views/liveSessionReminderStudent.ejs'));
                                                            }
                                                            else if (content.type === 'project') {
                                                                renderer = loopback.template(path.resolve(__dirname, '../../server/views/projectSubmissionReminderStudent.ejs'));
                                                            }
                                                            else {
                                                                renderer = loopback.template(path.resolve(__dirname, '../../server/views/inpersonSessionReminderStudent.ejs'));
                                                            }
                                                            var html_body = renderer(message);
                                                            loopback.Email.send({
                                                                to: participantInstance.email,
                                                                from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                                subject: 'Upcoming ' + content.type + ' session',
                                                                html: html_body
                                                            })
                                                                .then(function (response) {
                                                                    console.log('email sent! - ');
                                                                })
                                                                .catch(function (err) {
                                                                    console.log('email error! - ' + err);
                                                                });

                                                            // send email to teacher
                                                            if (content.type === 'online') {
                                                                renderer = loopback.template(path.resolve(__dirname, '../../server/views/liveSessionReminderTeacher.ejs'));
                                                            }
                                                            else if (content.type === 'project') {
                                                                renderer = loopback.template(path.resolve(__dirname, '../../server/views/projectSubmissionReminderTeacher.ejs'));
                                                            }
                                                            else {
                                                                renderer = loopback.template(path.resolve(__dirname, '../../server/views/inpersonSessionReminderTeacher.ejs'));
                                                            }
                                                            html_body = renderer(message);
                                                            loopback.Email.send({
                                                                to: collection.toJSON().owners[0].email,
                                                                from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                                subject: 'Upcoming ' + content.type + ' session',
                                                                html: html_body
                                                            })
                                                                .then(function (response) {
                                                                    console.log('email sent! - ');
                                                                })
                                                                .catch(function (err) {
                                                                    console.log('email error! - ' + err);
                                                                });
                                                        });
                                                    }
                                                });
                                            }
                                        } else {
                                            console.log("Time Unavailable !");
                                        }
                                    } else {
                                        console.log("Schedule Days Unavailable");
                                    }
                                });
                            }
                        });
                    }
                });
            });
        },
        function() {

        },
        true,
        'UTC'
    );
};
