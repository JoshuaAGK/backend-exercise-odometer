import initServer from './server/server.ts';
import { serverPort } from './config/constants.ts';

const app = await initServer();

app.listen(serverPort, (): void => {
  console.log(`Server is running on http://localhost:${serverPort}`);
});
