# 🚀 Nomad Ops – Redesign

> 🎨 **Redesign fork.** This repository is a redesign of [nomad-ops/nomad-ops](https://github.com/nomad-ops/nomad-ops), with the frontend rewritten in Vue 3 and Vue Flow. The backend and the original code are by the nomad-ops authors and used under the MIT License, see [LICENSE](LICENSE) 📄.

A simple operator for Nomad which reconciles the running jobs against Git repositories 🔄

> 🚧 Still work in progress, but it should do what it is supposed to :)  
> 📚 See [nomad-ops.github.io/nomad-ops](https://nomad-ops.github.io/nomad-ops/) for more information

## ✨ What's new in the redesign

- 🌑 **Dark, compact UI** with a light theme, inspired by ArgoCD
- 🗂️ **Applications** with filters by sync status and team, tile and list view, and a `/` shortcut for search
- 🌳 **Resource tree** drawn with [Vue Flow](https://vueflow.dev): source → jobs → task groups → allocations, with live task states
- 🖥️ **Cluster view**: servers, datacenters, client nodes and the allocations running on them
- 🔍 **Diff tab** that shows what would change in Nomad
- 👥 **Teams, deploy keys and vault tokens** ported to the new UI
- 🐳 `docker-compose.dev.yaml` and a mock server for quick local previews

## 👀 Take a look without a backend

```bash
cd frontend
npm install
npm run mock   # fake PocketBase + Nomad API on :8090
npm run dev    # the UI on http://localhost:3000, any login works
```

## 🐳 Getting started with docker

> 📋 You need [nomad](https://developer.hashicorp.com/nomad/docs/install) and docker installed on your system

1. 📥 Clone the repo
2. 🖥️ Start 2 terminal sessions at the root of this repo

Run the following in the first terminal:

> 💾 Make sure that docker volumes are available  
> 📎 You can use the provided `.deployment/nomad/agent.hcl` as a reference  
> 🔗 Remember to set the `NOMAD_ADDR` environment variable to the address of your nomad cluster

`nomad agent -dev -bind 0.0.0.0 -log-level INFO -config .deployment/nomad/agent.hcl`

This will bring up a nomad environment with docker volumes enabled. See the [nomad docs](https://developer.hashicorp.com/nomad/docs/operations/nomad-agent) for more info.

Run the following in the second terminal:

`nomad namespace apply nomad-ops`

This makes sure that the namespace nomad-ops exists.

Deploy Nomad-Ops to nomad by running:

`nomad job run .deployment/nomad/docker.hcl`

Prefer plain Docker? Use the compose file 🐙:

```bash
NOMAD_ADDR=http://<nomad-host>:4646 NOMAD_TOKEN=<token> docker compose -f docker-compose.dev.yaml up -d --build
```

### 🛠️ Access the Admin UI

Go to [http://localhost:8080/_/](http://localhost:8080/_/).
This will bring you to the login screen of [pocketbase](https://pocketbase.io).
Login using `admin@nomad-ops.org` and `simple-nomad-ops`.

> ℹ️ You only need to access this UI to create additional users. The main UI is available at [http://localhost:8080/](http://localhost:8080/)

### 🧭 Access the Nomad-Ops UI

You can access the UI of Nomad-Ops at [http://localhost:8080/](http://localhost:8080/) and use your newly created credentials to login.

By default the following user is created:

- 📧 email: `user@nomad-ops.org`
- 🔑 password: `simple-nomad-ops`

> 🔧 You can change the default user by setting the environment variables `DEFAULT_USER_EMAIL` and `DEFAULT_USER_PASSWORD`.

> ⚠️ The Admin User `admin@nomad-ops.org` is **only** capable to access the pocketbase ui at `http://{your-nomad-ops-host}/_/`. To access the Nomad-Ops UI you need to use a *normal* user.

### 🪪 Workload Identity

Workload identity is NOT supported.

Some APIs of nomad do not support the JWT token authentication. Until this is fixed you have to use the `NOMAD_TOKEN` environment variable to authenticate with the nomad api.

## 🙏 Thanks

> Thanks to https://github.com/pocketbase/pocketbase for providing a solid base : ) !

## 📖 Publishing docs

1. `docker run --rm -it -p 8000:8000 -v ${PWD}:/docs -v ~/.ssh:/root/.ssh --entrypoint /bin/sh --platform linux/amd64 squidfunk/mkdocs-material`
2. `apk add -U git openssh`
3. `git config --global url."git@github.com:".insteadOf "https://github.com/"`
4. `mkdocs gh-deploy`

## 📄 License

MIT, see [LICENSE](LICENSE). © 2023 nomad-ops, with the redesign built on top.
