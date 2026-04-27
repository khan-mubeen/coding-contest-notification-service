import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { MainApiClient } from './apiClient.js';
import { Mailer } from './mailer.js';
import { NotifierService } from './notifier.js';
import { createRouter } from './routes.js';
import { Store } from './store.js';

const app = express();
app.use(cors());
app.use(express.json());

const store = new Store(config.dataFile);
const apiClient = new MainApiClient();
const mailer = new Mailer();
const notifier = new NotifierService(store, apiClient, mailer);

app.use('/', createRouter(store, notifier));

app.listen(config.port, () => {
  console.log(`[notification-service] listening on :${config.port}`);
  notifier.start();
});
