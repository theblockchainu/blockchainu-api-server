'use strict';

module.exports = function (Assessmentnarule) {
    Assessmentnarule.validatesInclusionOf('value', { in: ['attendance', 'community'] });
};
