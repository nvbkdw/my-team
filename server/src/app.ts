import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, url } = req;
  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${method} ${url} ${_res.statusCode} ${duration}ms`);
  });
  next();
});

app.use(routes);

app.use(errorHandler);

export default app;
