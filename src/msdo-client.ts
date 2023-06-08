import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { IExecOptions } from "azure-pipelines-task-lib/toolrunner";
import * as common from './msdo-common';
import { MsdoInstaller } from './msdo-installer';

export class MsdoClient {
    cliVersion: string = 'Latest';

    async setupEnvironment() {
        
        console.log('------------------------------------------------------------------------------');

        if (!process.env.MSDO_FILEPATH) {
            let cliVersion = this.resolveCliVersion();
            let msdoInstaller = new MsdoInstaller();
            await msdoInstaller.install(cliVersion);
        }

        process.env.GDN_SETTINGS_FOLDERS = `Install=${process.env.MSDO_PACKAGES_DIRECTORY}`

        console.log('------------------------------------------------------------------------------');
    }

    resolveCliVersion() : string {
        let cliVersion = this.cliVersion;

        if (process.env.MSDO_VERSION) {
            cliVersion = process.env.MSDO_VERSION;
        }

        return cliVersion;
    }

    getCliFilePath() : string {
        let cliFilePath: string = process.env.MSDO_FILEPATH;
        tl.debug(`cliFilePath = ${cliFilePath}`);
        return cliFilePath;
    }

    async init() {
        try {
            let cliFilePath = this.getCliFilePath();
            let tool = tl.tool(cliFilePath).arg('init').arg('--force');
            await tool.exec();
        }
        catch (error) {
            tl.debug(error);
        }
    }

    async run(args: string[], successfulExitCodes: number[] = null, publish: boolean = true, publishArtifactName: string = null) {
        let tool = null;
        let sarifFile : string = path.join(process.env.BUILD_STAGINGDIRECTORY, '.gdn', 'msdo.sarif');
        tl.debug(`sarifFile = ${sarifFile}`);

        try {
            if (successfulExitCodes == null) {
                successfulExitCodes = [0];
            }

            await this.setupEnvironment();
            await this.init();
            
            let cliFilePath = this.getCliFilePath();

            tool = tl.tool(cliFilePath).arg('run');

            if (args != null) {
                for (let i = 0; i < args.length; i++) {
                    tool.arg(args[i]);
                }
            }

            tool.arg('--logger-pipeline');

            let systemDebug = tl.getVariable("system.debug");
            let loggerLevel = tl.getVariable("GDN_LOGGERLEVEL");
            tl.debug(`GDN_LOGGERLEVEL = ${loggerLevel}`);

            if (systemDebug == 'true') {
                tool.arg('--logger-level').arg('trace');
                tool.arg('--logger-show-level');
            }
            else if (loggerLevel) {
                tool.arg('--logger-level').arg(loggerLevel);
            }

            // Write it as a GitHub Action variable for follow up tasks to consume
            tl.setVariable('MSDO_SARIF_FILE', sarifFile);

            tool.arg('--export-breaking-results-to-file');
            tool.arg(sarifFile);

            tool.arg('--telemetry-environment');
            tool.arg('azdevops');
        } catch (error) {
            console.error('Exception occurred while initializing MSDO:');
            tl.setResult(tl.TaskResult.Failed, error);
            return;
        }

        try {
            // let us parse the exit code
            let options: IExecOptions = <IExecOptions>{
                ignoreReturnCode: true
            };

            tl.debug('Running Microsoft Security DevOps...');

            let exitCode = await tool.exec(options);

            let success = false;
            for (let i = 0; i < successfulExitCodes.length; i++) {
                if (exitCode == successfulExitCodes[i]) {
                    success = true;
                    break;
                }
            }

            if (publish && fs.existsSync(sarifFile)) {
                if (common.isNullOrWhiteSpace(publishArtifactName)) {
                    publishArtifactName = 'CodeAnalysisLogs';
                }

                console.log(`##vso[artifact.upload artifactname=${publishArtifactName}]${sarifFile}`);
            }

            if (!success) {
                throw `MSDO CLI exited with an error exit code: ${exitCode}`;
            }
        } catch (error) {
            tl.setResult(tl.TaskResult.Failed, error);
        }
    }
}