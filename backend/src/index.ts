import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { errorHandler } from './middleware/error-handler.middleware'
import { cors } from 'hono/cors'
import { success } from 'zod'
import { authRoutes } from './auth/auth.routes'


const app = new Hono()

app.onError(errorHandler)

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))

app.get('/', (c) => {
  return c.json({
    success: true, data: {
      message: "Welcome to the Generosity Incident Management API"
    }
  })
})

app.route('/auth', authRoutes)

app.get('/api/me', (c) => {
  const event = c.env as { requestContext: { authorizer: { jwt: { claims: Record<string, any> } } } }
  const claims = event.requestContext.authorizer.jwt.claims
  return c.json({ success: true, data: { sub: claims.sub, email: claims.email } })
})

export const handler = handle(app)