var Customer = require('./customer.js'),
    args = process.argv.slice(2);

if (args.length < 2) {
    console.log('invalid arg count');
    return;
}

switch (args[0]) {
    case 'customer':
        if (args[1] == 'create') {
            if (args.length < 3) {
                console.log('invalid arg count');
                return;
            }
            return (new Customer(args[2])).create();
        }
        if (args[1] == 'remove') {
            if (args.length < 3) {
                console.log('invalid arg count');
                return;
            }
            return (new Customer(args[2])).remove();
        }
        break;
}