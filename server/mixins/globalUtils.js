module.exports = function (Model, options) {
    'use strict';

    Model.observe('before delete', function (ctx, next) {
        //get the ID of the item being deleted.
        if (ctx.where.id) {
            var itemId = ctx.where.id;
            Model.dataSource.connector.execute(
                "match (c:"+Model.modelName+"{id:'"+itemId+"'})-[*]->(n) detach delete n",
                function (err, results) {
                    if (err) {
                        next(err);
                    }
                    else {
                        next();
                    }
                }
            );
        } else {
            var err = new Error("ID for the model to delete not found. Check your query.");
            err.statusCode = 400;
            console.log(err.toString());
            next(err);
        }
    });

};