import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'


const app = new Hono()

app.get('/', async (c) => {
  return c.text('Hello, World!')
})

app.get('/signin', async (c) => {

})

export const handler = handle(app)
