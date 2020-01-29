'use strict';

function maybe(cb) {
    try {
        return cb();
    } catch (_) {
        return null;
    }
}

class ServerlessLocalImportValuePlugin {
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.AWS = this.serverless.getProvider('aws');
        this.loggingEnabled = this.options.v || this.options.verbose;

        this.hooks = {
            'after:invoke:local:loadEnvVars': this.loadImportValueEnvs.bind(this),
        };

        this.pluginName = 'serverless-local-importvalue-plugin';
    }

    log(...args) {
        if (this.loggingEnabled) {
            console.log(...args);
        }
    }

    async loadImportValueEnvs() {
        const env = maybe(() => this.serverless.service.provider.environment);

        if (!this.AWS || !env) {
            return;
        }

        const valuesToImport = new Map();

        for (const key of Object.keys(env)) {
            const valueToImport = maybe(() => env[key]['Fn::ImportValue']);

            if (valueToImport) {
                valuesToImport.set(valueToImport, key);
            }
        }

        let remaining = valuesToImport.size;

        if (remaining === 0) {
            return;
        }

        await this.listCloudFormationExports(exports => {
            for (const cfExport of exports) {
                if (valuesToImport.has(cfExport.Name)) {
                    const env = valuesToImport.get(cfExport.Name);
                    process.env[env] = cfExport.Value;
                    remaining -= 1;

                    this.log(`[${this.pluginName}] process.env.${env}`);
                    this.log(`\t!ImportValue ${cfExport.Name}`);
                    this.log(`\tValue: ${cfExport.Value}`);
                }
            }

            return remaining === 0;
        });
    }

    async listCloudFormationExports(fn) {
        let NextToken = undefined;
        let shouldStop = false;

        do {
            const result = await this.AWS.request('CloudFormation', 'listExports', { NextToken });
            NextToken = result.NextToken;
            shouldStop = await fn(result.Exports);
        } while (!shouldStop && NextToken);
    }
}

module.exports = ServerlessLocalImportValuePlugin;
