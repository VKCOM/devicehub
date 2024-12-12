//
// Copyright © 2022 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
//

var _ = require('lodash')
var webpack = require('webpack')
var ProgressPlugin = require('webpack/lib/ProgressPlugin')
var pathutil = require('./lib/util/pathutil.cjs')
// var log = require('./lib/util/logger').createLogger('webpack:config')

module.exports = {
  webpack: {
    context: __dirname
    , cache: true
    , entry: {
      app: pathutil.resource('app/app.js')
      , authldap: pathutil.resource('auth/ldap/scripts/entry.js')
      , authmock: pathutil.resource('auth/mock/scripts/entry.js')
    }
    , output: {
      path: pathutil.resource('build')
      , publicPath: '/static/app/build/'
      , filename: 'entry/[name].entry.js'
      , chunkFilename: '[id].[hash].chunk.js'
    }
    , stats: {
      colors: true
    }
    , mode: process.env.NODE_ENV || 'development'
    , resolve: {
      modules: [
        pathutil.resource('app/components')
        , 'web_modules'
        , 'node_modules'
      ]
      , descriptionFiles: ['package.json']
      , extensions: ['.js', '.json']
      , alias: {
        '@u4/adbkit': './adbkit'
        , localforage: 'localforage/dist/localforage.js'
        , 'socket.io': 'socket.io-client'
        , stats: 'stats.js/src/Stats.js'
      }
    }
    , module: {
      rules: [
        {test: /\.css$/, use: ['style-loader', 'css-loader']}
        , {test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader']}
        , {test: /\.less$/, use: ['style-loader', 'css-loader', 'less-loader']}
        , {
          test: /\.(jpg|png|gif)$/, type: 'asset', parser: {
            dataUrlCondition: {
              maxSize: 1000,
            }
          }
        }
        , {
          test: /\.(svg|woff|otf|ttf|eot)/, type: 'asset', parser: {
            dataUrlCondition: {
              maxSize: 1,
            }
          }
        }
        , {test: /\.pug$/, loader: 'template-html-loader', options: {engine: 'jade'}}
        , {test: /\.html$/, loader: 'html-loader'}
        , {test: /angular\.js$/, loader: 'exports-loader', options: {type: 'commonjs', exports: 'angular'}}
        , {test: /angular-growl\.js$/, loader: 'imports-loader', options: {imports: 'angular'}}
        , {test: /dialogs\.js$/, loader: 'script-loader'}
        , {
          test: /node_modules\/(draggabilly|fizzy-ui-utils|get-size|outlayer|packery|unipointer)/
          , loader: 'imports-loader', options: {
            additionalCode:
              'var define = false;',
          },
        }
      ]
    },

    plugins: [
      new ProgressPlugin(_.throttle(
        function(progress, message) {
          var msg
          if (message) {
            msg = message
          }
          else {
            msg = progress >= 1 ? 'complete' : 'unknown'
          }
          console.log('Build progress %d%% (%s)', Math.floor(progress * 100), msg)
        }
        , 1000
      ))
    ]
  }
  , webpackServer: {
    plugins: [
      new webpack.LoaderOptionsPlugin({
        debug: true
      })
      ,
    ]
    , devtool: 'eval'
    , stats: {
      colors: true
    },

  }
}
