import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  environmentName: 'production',
  openTdbApiUrl: 'https://opentdb.com/api.php',
  cognito: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_QqLmITppi',
    userPoolClientId: '4j8o6n0uqoqhjvbpfdheoqfrd9',
    useLocalDevPool: false,
  },
  protectedApiOrigins: ['https://api.quizly.internal'],
};
