'use strict';

module.exports = function (Content) {

    //if (ctx.req.body.calendar !== null && ctx.req.body.calendar.length > 0) 

    Content.observe('before save', function filterCalendar(ctx, next) {
        if (ctx.instance.calendar) {
            ctx.hookState.content_calendar = ctx.instance.content_calendar;
            ctx.instance.unsetAttribute('content_calendar');
            return next();
        }
        next();
    });

    Content.observe('after save', function createCalendar(ctx, next) {
        if (ctx.isNewInstance) {
            var calInstance = ctx.hookState.content_calendar;
            calInstance.content_id = ctx.instance.id;
            ctx.instance.calendar.create(calInstance, function (err, result) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(result);
                }
            });
            next();
        }
    });

};
