import exec from './exec.js';
import Host from './host.js';
import * as User from './helper/user.js';
import Registry from './registry.js';

// private functions

const createHomeFolder = async (name) => {
    await exec('mkdir -p /var/www/vhost/{{name}}', { name });
    await exec('chown -R {{name}}:{{name}} /var/www/{{name}}', { name });
    return `/var/www/${name}`;
};

// client class

class Client {
    constructor(name) {
        this.name = name;
        this.hostnames = {};
        this.db = Registry.get('Database');
    }

    async info() {
        let result = await this.db.get(`
            SELECT *
            FROM "client"
            WHERE "client" = :client
            LIMIT 1
        `, {
            ':client': this.name
        });
        return result;
    }

    async exists() {
        return !! await this.info();
    }

    async create() {
        if (await this.exists()) {
            return;
        }

        // find free username
        const user = await User.free(this.name);

        await User.create(user, `/var/www/vhost/${user}`);
        const home = await createHomeFolder(user);

        await this.db.run(`
            INSERT
            INTO "client"
              ("client", "user", "path")
            VALUES
              (:client, :user, :path)
        `, {
            ':client': this.name,
            ':user': user,
            ':path': home
        });
    }

    async remove() {
        const info = await this.info();
        if (!info) {
            return;
        }

        await this.db.run(`
            DELETE
            FROM "client"
            WHERE "client" = :client
        `, {
            ':client': this.name
        });

        console.warn('TODO: delete all hosts for this user');

        await User.remove(info.user, `/var/www/backup/${info.user}`);
    }

    async addHost(hostname) {
        await (new Host(this, hostname)).create();
    }

    async removeHost(hostname) {
        await (new Host(this, hostname)).remove();
    }
}

export default Client;