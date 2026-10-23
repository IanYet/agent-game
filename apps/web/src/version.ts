import packageInfo from '../../../package.json';
export const WEB_VERSION=packageInfo.version;
export const connectorRequirements={protocolVersion:4,minimumVersion:'0.4.1',capabilities:['dynamic-tools-v1','json-schema-2020-12','player-scopes-v1','concurrent-decisions-v1','structured-results-v1']};
