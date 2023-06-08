"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsdoClient = void 0;
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const fs = __importStar(require("fs"));
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const common = __importStar(require("./msdo-common"));
const msdo_installer_1 = require("./msdo-installer");
class MsdoClient {
    constructor() {
        this.cliVersion = 'Latest';
    }
    setupEnvironment() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('------------------------------------------------------------------------------');
            if (!process.env.MSDO_FILEPATH) {
                let cliVersion = this.resolveCliVersion();
                let msdoInstaller = new msdo_installer_1.MsdoInstaller();
                yield msdoInstaller.install(cliVersion);
            }
            process.env.GDN_SETTINGS_FOLDERS = `Install=${process.env.MSDO_PACKAGES_DIRECTORY}`;
            console.log('------------------------------------------------------------------------------');
        });
    }
    resolveCliVersion() {
        let cliVersion = this.cliVersion;
        if (process.env.MSDO_VERSION) {
            cliVersion = process.env.MSDO_VERSION;
        }
        return cliVersion;
    }
    getCliFilePath() {
        let cliFilePath = process.env.MSDO_FILEPATH;
        tl.debug(`cliFilePath = ${cliFilePath}`);
        return cliFilePath;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let cliFilePath = this.getCliFilePath();
                let tool = tl.tool(cliFilePath).arg('init').arg('--force');
                yield tool.exec();
            }
            catch (error) {
                tl.debug(error);
            }
        });
    }
    run(args, successfulExitCodes = null, publish = true, publishArtifactName = null) {
        return __awaiter(this, void 0, void 0, function* () {
            let tool = null;
            let sarifFile = path.join(process.env.BUILD_STAGINGDIRECTORY, '.gdn', 'msdo.sarif');
            tl.debug(`sarifFile = ${sarifFile}`);
            try {
                if (successfulExitCodes == null) {
                    successfulExitCodes = [0];
                }
                yield this.setupEnvironment();
                yield this.init();
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
                tl.setVariable('MSDO_SARIF_FILE', sarifFile);
                tool.arg('--export-breaking-results-to-file');
                tool.arg(sarifFile);
                tool.arg('--telemetry-environment');
                tool.arg('azdevops');
            }
            catch (error) {
                console.error('Exception occurred while initializing MSDO:');
                tl.setResult(tl.TaskResult.Failed, error);
                return;
            }
            try {
                let options = {
                    ignoreReturnCode: true
                };
                tl.debug('Running Microsoft Security DevOps...');
                let exitCode = yield tool.exec(options);
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
            }
            catch (error) {
                tl.setResult(tl.TaskResult.Failed, error);
            }
        });
    }
}
exports.MsdoClient = MsdoClient;
