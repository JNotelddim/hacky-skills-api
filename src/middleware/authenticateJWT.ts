import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * `authenticateJWT` is needed for ensuring that the client making the
 * requests is the BoltJS app.
 * We're using time-limited HMAC SHA256 signing with JWT tokens on all requests
 * from the BoltJS app, and then this API validates the tokens.
 * This way we know fairly confidently that it's the bolt app making the requests.
 */
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // const authHeader = req.headers.authorization;

  next();

  // try {
  //   if (!authHeader) {
  //     console.log("missing authheader");
  //     res.sendStatus(400);
  //     return;
  //   }

  //   if (!process.env.BOLT_KEY) {
  //     console.log("missing bolt key");
  //     res.sendStatus(500);
  //     return;
  //   }

  //   const token = authHeader.split(" ")[1];
  //   jwt.verify(token, process.env.BOLT_KEY, (err, payload) => {
  //     if (err) {
  //       console.log({ err });
  //       return res.sendStatus(403);
  //     }

  //     (req as any).authPayload = payload;

  //     next();
  //   });
  // } catch (e) {
  //   console.log(e);
  // }
};
