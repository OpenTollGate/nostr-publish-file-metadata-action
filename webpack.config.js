//webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      "ws": false
    }
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
  },
  externalsPresets: { node: true },
  externals: {
    'ws': 'commonjs2 ws'
  }
};
