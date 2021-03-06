/* eslint-env node */
'use strict';

var TreeMerger = require('broccoli-merge-trees');
var Funnel = require('broccoli-funnel');
var LessCompiler = require('broccoli-less-single');

module.exports = {
    name: 'ember-data-visualizations',
    isDevelopingAddon() {
        return Boolean(process.env.DATA_VIS_DEV_MODE);
    },
    treeForAddon(tree) {
        var defaultTree = this._super.treeForAddon.call(this, tree);

        // Funnel the addon's component styles so they can be imported into addon.less
        var addonLessTree = new Funnel(tree, {
            include: ['components/**/*.less'],
            destDir: 'styles/addon'
        });

        var compiledLessTree = new LessCompiler(new TreeMerger([tree, addonLessTree]), 'styles/addon.less', this.name + '.css');

        return new TreeMerger([defaultTree, compiledLessTree]);
    }
};
