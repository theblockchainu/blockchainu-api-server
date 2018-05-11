'use strict';

module.exports = function (Scholarship) {
    Scholarship.validatesInclusionOf('type', { in: ['public', 'private'] });
};
