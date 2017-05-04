'use strict';

module.exports = function(Content) {

    Content.afterRemote('create', function(ctx,contentInstance,next){
        if(ctx.req.body.calendar !== null && ctx.req.body.calendar.length > 0) {
            var calendar = JSON.parse(ctx.req.body.calendar);
            calendar.content_id = contentInstance.id;
            Content.app.models.content_calendar.create(calendar, function(err, contentCalendarInstance){
                if(err){
                    contentInstance.destroy();
                    next(err);
                }

                /*
                 NEW: Content -[hasCalendar]-> ContentCalendar
                 */
                Content.dataSource.connector.execute(
                    "MATCH (c:content {id: '"+ contentInstance.id +"'}),(n:content_calendar {id: '"+ contentCalendarInstance.id +"'}) MERGE (c)-[r:hasCalendar]->(n) RETURN n",
                    function (err, results) {
                        if(err) {
                            next(err);
                        }
                        else {
                            next();
                        }
                    }
                );

            });
        }
        else {
            next();
        }
    });
};
