const path = require('path');

module.exports = {
    mode: 'production',
    entry: path.join(__dirname, './src/nes-embed.js'),
    module:{
        rules:[
            {
                test:/\.css$/,
                use:['style-loader','css-loader']
            }
        ]
    }
}