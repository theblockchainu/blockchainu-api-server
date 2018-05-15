'use strict';

module.exports = function (Knowledgestory) {
    Knowledgestory.validatesInclusionOf('visibility', { in: ['private', 'public'] });
};
