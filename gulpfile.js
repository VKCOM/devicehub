import path from 'path'
import gulp from 'gulp'
import gutil from 'gulp-util'
import jsonlint from 'gulp-jsonlint'
import eslint from 'gulp-eslint'
import eslintIfFixed from 'gulp-eslint-if-fixed'
import {ESLint} from 'eslint'
import webpack from 'webpack'
import webpackConfig from './webpack.config.cjs'
import webpackStatusConfig from './res/common/status/webpack.config.js'
import gettext from 'gulp-angular-gettext'
import pug from 'gulp-pug'
import del from 'del'
import protractor from './res/test/e2e/helpers/gulp-protractor-adv.js'
import karma from 'karma'
import stream from 'stream'
import run from 'gulp-run'
var protractorConfig = './res/test/protractor.conf'
var Karma = karma.Server
var karmaConfig = '/res/test/karma.conf.js'
gulp.task('jsonlint', function() {
    return gulp.src([
        '.yo-rc.json'
        , '*.json'
    ], {allowEmpty: true})
        .pipe(jsonlint())
        .pipe(jsonlint.reporter())
})
gulp.task('eslint-cli', function(done) {
    (async() => {
        const cli = new ESLint({
            cache: true
            , fix: false
        })
        const report = await cli.lintFiles([
            'lib/**/*.js'
            , 'res/app/**/*.js'
            , 'res/auth/**/*.js'
            , 'res/common/**/*.js'
            , 'res/test/**/*.js'
            , 'res/web_modules/**/*.js'
            , '*.js'
        ])
        // 3. Modify the files with the fixed code.
        await ESLint.outputFixes(report)
        const errors = ESLint.getErrorResults(report)
        // 4. Format the results.
        const formatter = await cli.loadFormatter('stylish')
        const resultText = formatter.format(errors)
        if (errors.length > 0) {
            done(new gutil.PluginError('eslint-cli', resultText))
        }
        else {
            done()
        }
    })()
})
gulp.task('lint-fix', function() {
    let isContainsFixes = false
    return gulp.src([
        'lib/**/*.js'
        , 'res/**/*.js'
    ])
        .pipe(eslint({fix: true}))
        .pipe(eslintIfFixed(file => {
        isContainsFixes = true
        return file.base
    }))
        .pipe(eslint.format())
        .pipe(eslint.failAfterError()).on('end', function() {
        if (isContainsFixes) {
            throw new Error('Eslint repaired code in files (try to re-commit)')
        }
    })
})
gulp.task('run:checkversion', function() {
    gutil.log('Checking STF version...')
    return run('./bin/stf -V').exec()
})
gulp.task('karma_ci', function(done) {
    const karma = new Karma({
        configFile: path.join(__dirname, karmaConfig)
        , singleRun: true
    }, done)
    karma.start()
})
gulp.task('karma', function(done) {
    const karma = new Karma({
        configFile: path.join(__dirname, karmaConfig)
    }, done)
    karma.start()
})
if (gutil.env.multi) {
    protractorConfig = './res/test/protractor-multi.conf'
}
else if (gutil.env.appium) {
    protractorConfig = './res/test/protractor-appium.conf'
}
gulp.task('webdriver-update', protractor.webdriverUpdate)
gulp.task('webdriver-standalone', protractor.webdriverStandalone)
gulp.task('protractor-explorer', function(callback) {
})
gulp.task('protractor', gulp.series('webdriver-update', function(callback) {
    gulp.src(['./res/test/e2e/**/*.js'])
        .pipe(protractor.protractor({
        configFile: protractorConfig
        , debug: gutil.env.debug
        , suite: gutil.env.suite
    }))
        .on('error', function(e) {
        console.log(e)
        /* eslint no-console: 0 */
    })
        .on('end', callback)
}))
// For piping strings
function fromString(filename, string) {
    var src = new stream.Readable({objectMode: true})
    src._read = function() {
        this.push(new gutil.File({
            cwd: ''
            , base: ''
            , path: filename
            , contents: Buffer.from(string)
        }))
        this.push(null)
    }
    return src
}
// For production
gulp.task('webpack:build', function(callback) {
    var myConfig = Object.create(webpackConfig.webpack)
    myConfig.plugins = myConfig.plugins.concat(new webpack.DefinePlugin({
        'process.env': {
            NODE_ENV: JSON.stringify('production')
        }
    }))
    myConfig.devtool = false
    webpack(myConfig, function(err, stats) {
        if (err) {
            throw new gutil.PluginError('webpack:build', err)
        }
        gutil.log('[webpack:build]', stats.toString({
            colors: true
        }))
        // Save stats to a json file
        // Can be analyzed in http://webpack.github.io/analyse/
        fromString('stats.json', JSON.stringify(stats.toJson()))
            .pipe(gulp.dest('./tmp/'))
        callback()
    })
})
gulp.task('webpack:others', function(callback) {
    var myConfig = Object.create(webpackStatusConfig)
    myConfig.plugins = myConfig.plugins.concat(new webpack.DefinePlugin({
        'process.env': {
            NODE_ENV: JSON.stringify('production')
        }
    }))
    myConfig.devtool = false
    webpack(myConfig, function(err, stats) {
        if (err) {
            throw new gutil.PluginError('webpack:others', err)
        }
        gutil.log('[webpack:others]', stats.toString({
            colors: true
        }))
        callback()
    })
})
gulp.task('pug', function() {
    return gulp.src([
        './res/**/*.pug'
    ])
        .pipe(pug({
        locals: {
            // So res/views/docs.pug doesn't complain
            markdownFile: {
                parseContent: function() {
                }
            }
        }
    }))
        .pipe(gulp.dest('./tmp/html/'))
})
gulp.task('translate:extract', gulp.series('pug', function() {
    return gulp.src([
        './tmp/html/**/*.html'
        , './res/**/*.js'
        , '!./res/build/**'
    ])
        .pipe(gettext.extract('stf.pot'))
        .pipe(gulp.dest('./res/common/lang/po/'))
}))
gulp.task('translate:compile', function() {
    return gulp.src('./res/common/lang/po/**/*.po')
        .pipe(gettext.compile({
        format: 'json'
    }))
        .pipe(gulp.dest('./res/common/lang/translations/'))
})
gulp.task('translate:push', function() {
    gutil.log('Pushing translation source to Transifex...')
    return run('tx push -s').exec()
})
gulp.task('translate:pull', function() {
    gutil.log('Pulling translations from Transifex...')
    return run('tx pull').exec()
})
gulp.task('clean', function(cb) {
    return del([
        './tmp'
        , './res/build'
        , '.eslintcache'
    ], cb)
})
gulp.task('build', gulp.parallel('clean', 'webpack:build'))
gulp.task('lint', gulp.parallel('jsonlint', 'eslint-cli'))
gulp.task('test', gulp.parallel('lint', 'run:checkversion'))
gulp.task('translate', gulp.parallel('translate:extract', 'translate:push', 'translate:pull', 'translate:compile'))
