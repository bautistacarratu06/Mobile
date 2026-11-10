export interface CognitoConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  /**
   * When true in local development/testing without live AWS credentials,
   * uses the in-memory/local Cognito-compatible adapter while still validating
   * and reporting if live AWS User Pool IDs are placeholders.
   */
  useLocalDevPool?: boolean;
}

export interface AppEnvironment {
  production: boolean;
  environmentName: 'development' | 'staging' | 'production';
  openTdbApiUrl: string;
  cognito: CognitoConfig;
  protectedApiOrigins: string[];
}
