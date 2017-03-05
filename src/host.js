import Promise from 'bluebird';
import fs from 'fs';
import exec from './exec.js';
import Handlebars from 'handlebars';
import Pool from './pool.js';
import Registry from './registry.js';
import * as User from './helper/user.js';
import convert from './helper/convert.js';
import * as Task from './task';

const readFile  = Promise.promisify(fs.readFile);

const createVhostFolder = async (path, user) => {
    await exec('mkdir -p {{path}}', { path });
    await exec('mkdir -p {{path}}', { path: path + '/temp' });
    await exec('mkdir -p {{path}}', { path: path + '/logs' });
    await exec('mkdir -p {{path}}', { path: path + '/sessions' });
    await exec('mkdir -p {{path}}', { path: path + '/web' });
    await exec('chown -R {{user}}:{{user}} {{path}}', { path, user });
};

const removeVhostFolder = async (path) => {
    await exec('rm -fr {{path}}', { path });
};

const addPool = async (host) => {
    await (new Pool(host)).create();
};

const removePool = async (host) => {
    await (new Pool(host)).remove();
};

// load and compile vhost template
const loadTemplate = readFile(__dirname + '/templates/vhost.hbs', 'utf-8')
    .then(function(template) {
        return Handlebars.compile(template);
    });

class Host {
    constructor(client, name) {
        this.client = client;
        this.name = name;
        this.db = Registry.get('Database');
    }

    async info() {
        let result = await this.db
            .table('host')
            .first('*')
            .where({
                host: this.name,
                client: this.client.name
            })
            .limit(1);
        return result;
    }

    async exists() {
        return !! await this.info();
    }

    async create() {
        if (await this.exists()) {
            return;
        }

        // find free username and collect data for database
        const user = await User.free(this.name);
        const hostFolder = convert(this.name, '-a-z0-9_\.');
        const clientInfo = await this.client.info();
        const home = `${clientInfo.path}/${hostFolder}`;

        // insert into database
        await this.db
            .table('host')
            .insert({
                host: this.name,
                client: this.client.name,
                user: user,
                path: home
            });

        // create user
        await User.create(user, home);

        // create host file
        await this.updateHost();

        // create vhost folder
        await createVhostFolder(home, user);
        await Task.run('apache.vhost.enable', {
            hostname: this.name
        });

        // create fpm pool
        await addPool(this);

        // reload apache
        await Task.run('apache.reload');
    }

    async updateHost() {
        const [ info, template ] = await Promise.all([
            this.info(),
            loadTemplate
        ]);

        const documentRoot = `${info.path}/web`;
        const logsFolder = `${info.path}/logs`;
        let data = template(Object.assign(this, {
            port: 80,
            user: info.user,
            documentRoot,
            logsFolder,
            alias: info.alias? info.alias.split(',').join(' ') : null
        }));
        await Task.run('apache.vhost.create', {
            hostname: this.name,
            data
        });
    }

    async remove() {
        const info = await this.info();
        if (!info) {
            return;
        }

        await Task.run('apache.vhost.disable', {
            hostname: this.name
        });

        await Promise.all([
            Task.run('apache.vhost.remove', {
                hostname: this.name
            }),
            removeVhostFolder(info.path),
            removePool(this),
            User.remove(info.user, `/var/www/backup/${info.user}`)
        ]);

        await Task.run('apache.reload');

        await this.db
            .table('host')
            .where({
                host: this.name
            })
            .delete();
    }
}

Host.all = async () => {
    const db = Registry.get('Database');
    let result = await db
        .table('host')
        .select('*')
        .orderBy('host');
    return result;
};

Host.allByClient = async (client) => {
    const db = Registry.get('Database');
    let result = await db
        .table('host')
        .select('*')
        .where({
            client: client.name
        })
        .orderBy('host');
    return result;
};

export default Host;
