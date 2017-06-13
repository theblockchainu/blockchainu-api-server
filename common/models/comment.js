'use strict';

module.exports = function(Comment) {
    
    Comment.afterRemote('prototype.__create__replies', function (ctx, newInstance, next) {
        
        if (ctx.req.user) {
            var userId = ctx.req.user.id;
            Comment.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    console.log("Relation created between reply and peer.");
                });
            });
        } else
            console.log("User Not Signed in!");
        next();
    });
};
