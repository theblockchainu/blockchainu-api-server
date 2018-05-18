'use strict';

module.exports = function (Knowledgestory) {
    Knowledgestory.validatesInclusionOf('status', { in: ['approved', 'pending', 'rejected'] });
    Knowledgestory.validatesInclusionOf('visibility', { in: ['private', 'public'] });
};
