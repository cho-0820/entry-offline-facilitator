const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.NODE_ENV === 'development' ? 'cheap-module-eval-source-map' : 'source-map',
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    node: {
        __dirname: true,
        __filename: true,
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /(node_modules|dist|dist_web)/,
                loader: ['ts-loader'],
            },
            {
                test: /\.(ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|cur)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'url-loader',
                options: {
                    name: '[hash].[ext]',
                    limit: 10000,
                },
            },
        ],
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, '..', 'node_modules', 'entry-js', 'images'),
                    to: path.resolve(__dirname, '..', 'dist_web', 'vendor', 'entry-js', 'images')
                }
            ]
        })
    ],
};
