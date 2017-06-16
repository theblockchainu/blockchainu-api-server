'use strict';

module.exports = function(Room) {

    Room.afterRemote('prototype.__create__messages', function (ctx, newInstance, next) {
        if (ctx.req.user) {
            var userId = ctx.req.user.id;

            Room.app.models.peer.findById(userId, function (err, instance) {
                newInstance.peer.add(instance, function (err, addedinstance) {
                    if(!err) {
                        console.log("Room is", ctx.req.params.id);
                        Room.app.io.to(ctx.req.params.id).emit('message',newInstance);
                    }
                    else {
                        newInstance.delete();
                    }
                });
            });
        } else {
            console.log("User Not Signed in!");
            newInstance.delete();
        }
        next();
    });

};
