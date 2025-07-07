import { Router } from 'express';

//boilderplate for a post request to create an agent
const router = Router();

router.get('/', async (req, res) => {
  res.send('OK');
});

export { router as getHeartbeatRouter };
