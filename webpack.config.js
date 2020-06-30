const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const buildPath = path.resolve(__dirname, 'dist');

module.exports = {
    entry: {
        background: './src/background.js',
        popup: './src/popup/popup.js'
    },
    output: {
        path: buildPath,
        filename: "[name].js",
    },
    module: {
        rules: [
            {
                test: /\.js$/i,
                exclude: /node_modules/,
                loader: 'babel-loader'
            },
            {
                test: /\.css$/i,
                use: [
                    "style-loader",
                    "css-loader"
                ]
            }
        ]
    },

    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './src/popup/popup.html',
            inject: true,
            chunks: ['popup'],
            filename: 'popup.html'
        }),
        new CopyPlugin({
            patterns: [
                { from: './src/manifest.json', to: './[name].[ext]' },
                { from: './src/assets/', to: './assets/' },
                { from: './node_modules/webextension-polyfill/dist/browser-polyfill.min.js', to: './' },
                { from: './node_modules/webextension-polyfill/dist/browser-polyfill.min.js.map', to: './' }
            ],
        })
    ]
}