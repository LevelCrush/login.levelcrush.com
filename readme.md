# api.levelcrush.com

This repository contains the code that is represented on the following domains (**currently**)

-   [login.levelcrush.com](https://login.levelcrush.com) (Production, intended for only stable and finalized features)
-   [stage-login.levelcrush.com](https://stage-login.levelcrush.com) (Stage , intended for public testing of new features)
-   [dev-login.levelcrush.com](https://dev-login.levelcrush.com) (Unstable and intended for developers only)

---

## Installing and building

Building and installing locally requires a number of dependencies. You will need the following items before successfully running this server build

### **Minimum Dependencies**

-   Node.js Version 16.x LTS minimum: [Official Site](https://nodejs.org)
-   MySql Server running locally or remotely
-   A running build of the repository [@LevelCrush/api.levelcrush.com](https://github.com/LevelCrush/api.levelcrush.com)
-   A running build of the repository [@LevelCrush/login.levelcrush-widget](https://github.com/LevelCrush/login.levelcrush.com-widget) (Optional, only needed if you want to build the widget and make changes)

The local builds for **api.levelcrush** and **login.levelcrush** are recommended to run locally, but you are welcome to run it inside a virtual machine/container whatever you prefer, wherever you want. Just be sure to remember your hostname your using + port you use for each as it IS important, as you will need to populate an env.ts file before running.

**DO NOT** use the "**LevelCrush**" production or "**LevelCrushStaging**" mysql server running on lightsail. These two instances are intended to only run on the live versions of the site that are accessible.

## How to run the server?

Assuming you have properly setup your env.ts in the src folder **AND** ormconfig.js inside your root, you can use the below commands to run the server.

If you are looking to run the server locally with typescript runtime support (**Recommended for development**) Then you can run the following command below from your terminal.

```
npm run debug
```

If you have setup a env.ts and need to build the application

```
npm run build
```

Respectively once you have built the source successfully and if you are not looking to do any development, and are looking to run the server as if you would be in a production enviroment, then run the following command.

```
npm run production
```

At the moment of writing, the following command is equivalent to running the production script.

```
node dist/app.js
```

Syncronizing database tables via TypeORM. (**This action can result in data loss**) This will create the schema in the database linked in your ormconfig.js

```
npm run typeorm schema:sync
```

Drop tables and sync schema (you will lose data)

```
npm run typeorm schema:drop
npm run typeorm schema:sync
```

Full procedure assuming you have a configured env.ts and ormconfig.js already on a first time download and setup

```
npm install
npm run build
npm run typeorm schema:sync
npm run debug
```

---

## Creating an env.ts file

Before you can successfully build the server you must create a **env.ts** file inside the src folder. Below you find a simple visual to confirm the location of said env.ts and where it should go.

```
Folder structure example
| login.levelcrush
    | readme.md
    | tsconfig.json
    | ...
    | src
        | ...
        | env.ts <- this is where your env.ts should go
        | env_interface.ts <- use this as a template if you do not have a env.ts

```

### **YOU MUST MANUALLY CREATE env.ts inside the src folder**

### env_interface.ts definition

Possible configuration for an env.ts file

```typescript
export interface ENV {
    server?: {
        session?: {
            ttl?: 86400 | number;
            secret?: string;
        };
        port?: number;
        assets?: string;
        domain?: string;
        url?: string;
        ssl?: {
            key: string;
            cert: string;
        };
    };
    hosts: {
        api: string;
        login: string;
        frontend: string;
    };
    platforms: {
        api: {
            token: string;
            token_secret: string;
        };
        discord: {
            oauth: {
                urls: {
                    authorize: string;
                    token: string;
                    revoke: string;
                };
                client_id: string;
                client_secret: string;
                public_key: string;
            };
        };
    };
}

export default ENV;
```

### Minimum env.ts

```typescript
import path = require('path');
import ENV from './env_interface';

export const Environment: ENV = {
    server: {
        session: {
            ttl: 21600, // 6 hours
        },
        port: 8081,
        assets: path.join(__dirname, '..', 'assets'),
        domain: 'login.levelcrush.local',
        url: 'http://login.levelcrush.local',
    },
    hosts: {
        api: 'http://api.levelcrush.local',
        frontend: 'http://levelcrush.local',
        login: 'http://login.levelcrush.local',
    },

    platforms: {
        api: {
            token: '[api application here]',
            token_secret: '',
        },
        discord: {
            oauth: {
                urls: {
                    authorize: 'https://discord.com/api/oauth2/authorize',
                    token: 'https://discord.com/api/oauth2/token',
                    revoke: 'https://discord.com/api/oauth2/token/revoke',
                },
                client_id: 'appkeyhere',
                client_secret: 'appsecrethere',
                public_key: 'apppublickeyhere',
            },
        },
    },
};

export default Environment;
```

Once you have setup your env.ts your next step is to setup your ormconfig.js file.

---

## Setting up ormconfig.js

This server runs TypeORM as its ORM to simplify database access. To use typeorm you **must** include your own ormconfig.js at the root of your project directory. Simliar to env.ts , without it you will not be able to successfully build your project. There is an included [ormconfig.sample.js](https://github.com/LevelCrush/api.levelcrush.com/blob/main/ormconfig.sample.js) file that has a blue print for you.

### ormconfig.sample.js contents

```js
module.exports = {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '',
    database: 'levelcrush',
    synchronize: true,
    logging: false,
    entities: [__dirname + '/orm/entity/**/*.{js,ts}'],
    migrations: [__dirname + '/orm/migration/**/*.{js,ts}'],
    subscribers: [__dirname + '/orm/subscriber/**/*.{js,ts}'],
    cli: {
        entitiesDir: __dirname + '/orm/entity',
        migrationsDir: __dirname + '/orm/migration',
        subscribersDir: __dirname + '/orm/subscriber',
    },
};
```

### What your ormconfig.js can look like

```js
// allow support for --dev flag to distignuish where to load entities and migrations depending on versino of build
let devMode = false;
process.argv.slice(2, process.argv.length).forEach((arg) => {
    if (arg.indexOf('--dev') === 0) {
        let splitArg = arg.split('=');
        devMode = true;
    }
});
module.exports = {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '',
    database: 'levelcrush',
    synchronize: false,
    logging: true,
    entities: [__dirname + '/' + (devMode ? 'src' : 'dist') + '/orm/entity/**/*.{js,ts}'],
    migrations: [__dirname + '/' + (devMode ? 'src' : 'dist') + '/orm/migration/**/*.{js,ts}'],
    subscribers: [__dirname + '/' + (devMode ? 'src' : 'dist') + '/orm/subscriber/**/*.{js,ts}'],
    cli: {
        entitiesDir: __dirname + '/' + (devMode ? 'src' : 'dist') + '/orm/entity',
        migrationsDir: __dirname + '/' + (devMode ? 'src' : 'dist') + '/orm/migration',
        subscribersDir: __dirname + '/' + (devMode ? 'src' : 'dist') + '/orm/subscriber',
    },
};
```

You can visit the TypeOrm documentation linked below to get a full list of possible configurations. In the above example this is setup assuming a production and dev enviroment. If you are running **exclusively** a dev environment you can reduce the complexity of this file significantly.

Why is this file not included? Like env.ts, it is unique to your enviorment and build production. We do not want to share sensitive data in the repositories

## How to setup routes

Create new controller and add it to the [app.ts](https://github.com/LevelCrush/login.levelcrush.com/blob/main/src/app.ts) initializetion process.

```typescript
let controllers: ServerController[] = [new DiscordController()];
controllers.forEach((controller, index) => {
    server.router(controller.route, controller.router);
});
```

## How to serve assets

Assets are stored in the assets folder. See below for an example url map

```
| project directory
    | readme.md
    | tsconfig.json
    | src
    | assets -> https://login.levelcrush.com/assets/**/*
        | css -> https://login.levelcrush.com/assets/css/**/*
        | images -> https://login.levelcrush.com/assets/images/**/*
        | js -> https://login.levelcrush.com/assets/js/**/*
        | root -> https://login.levelcrush.com/**/* OR https://login.levelcrush.com/assets/root/**/*
```

From the above visual you can see that in general, the assets folder is mapped to the equivalent of https://levelcrush.com/assets. The "root" folder has a special mapping that is intended for files that are hosted at the / of a website traditionally. Such as favicons and robots.txt

## What's the stack

### Below is a table of "packages" that we use

| Package    | Used Where                                                   |
| ---------- | ------------------------------------------------------------ |
| Typescript | Application Language                                         |
| Express    | Web Server                                                   |
| TypeORM    | Object Relation Mapper of choice                             |
| mysql2     | Database Driver of choice                                    |
| moment     | Date formating and timestamps                                |
| ts-node    | Used to run debug builds with typescript support at runtime. |

### Table of Middlewhere and what package uses it

| Middleware      | Used By |
| --------------- | ------- |
| body-parser     | express |
| cors            | express |
| express-session | express |
| multer          | express |

---

## Why not merge login.levelcrush and api.levelcrush into this one server?

Great question. The previous iteration of levelcrush.com was built on **Wordpress**. While Wordpress itself is fine, the original idea was to have members of leadership or have members of the community edit the website and manage it. However this did not stick, and there were other services that were wanted more but still needed to be on a levelcrush.com domain space. The result was a monolithic plugin that handled SSO/apis/etc. While altogether not terrible, maintaining the site and plugin was a nightmare.

Not only did you need to run the bloated wordpress installation, but now you had to have wordpress knowledge + extensive php knowledge to work on it and it was a much slower development process. The flexibiltiy as well of the login system due to it being hosted on wordpress via plugin was very scope limiting.

By seperating the api out and the login functionality into its own domain and keeping them isolated, it is the belief that we will be able to work on features / domains much better and allow other users to use our api system to create better interactive experiences for our community.

To this purpose: levelcrush.com will serve mainly as a "wrapper" around the api , allowing users to eventually do the following features

-   Access a members dashboard to access creator tools
-   Access a party room where users will be able to watch private streams/watch parties as a community
-   Provide a streamlined interface to LFG and keep track of said LFG's
-   Provide a mechanism to have polls to reach out to the community
-   Provide a mechanism to have users give feedback on the community
-   Provide a mechanism to link accounts such as bungie/xbox/etc and have a unified account that will be representive of them in the other "levelcrush applications"

levelcrush.com will leverage this api on both the server side and client side where appropriate.

### What happens when we want to develop an application that is **not** hosted on the \*.levelcrush.com domain space?

Our system will support these applications so long as they are whitelisted. Allowing other developers to leverage our network and provide unique experiences for users, using one single sign on. Even if there is no immediate need for this functionality, the system supports it due to this structure we have setup, allowing it to be much more portable.

## Where does login.levelcrush come in?

What exactly does login.levelcrush do? It provides a uniform api to register and login a user across various platforms and communicates that to the api.levelcrush service. This will be level crush's official login interface. It is built on top of the application support that api.levelcrush provides.

It also serves a widget found in /assets/widget/version/\* . This is largely important as this widget is what will allow "Level Crush Applications" to retrieve uniformed information about a user and if they are logged into the network or not. (Mileage will vary based on browser security/etc) This also will provide a mechanism to easily log in and get certain information pertaining to the users that other application specific logic may need. In short, it removes alot of boilerplate and provides a standard way for a user to login on the client side to the levelcrush network.

Currently it only supports discord login, but we will be merging the bungie and microsoft account login code from the wordpress plugin into the equivalent here.

To see and or develop the login widget further please see: [@LevelCrush/login.levelcrush-widget](https://github.com/LevelCrush/login.levelcrush.com-widget)

TODO: include database schema readme

---

## External Library Documentation

-   Node.js: [https://nodejs.org/en/docs/](https://nodejs.org/en/docs/)
-   Typescript: [https://www.typescriptlang.org/docs/](https://www.typescriptlang.org/docs/)
-   Express: [https://expressjs.com/en/4x/api.html](https://expressjs.com/en/4x/api.html)
-   TypeORM: [https://typeorm.io/#/](https://typeorm.io/#/)
