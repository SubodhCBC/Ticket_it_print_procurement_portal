import { getConfig } from '@/server/config'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { NotFoundError } from '@/server/utils/errors'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * Swagger UI, pinned to an exact release and loaded from jsDelivr.
 *
 * From a CDN rather than a package: the page is a developer tool that is off in
 * production, and bundling swagger-ui would add a dependency — and several
 * megabytes to the server build — for something no user ever loads.
 */
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.15'

const SPEC_URL = '/api/docs/openapi.json'

/**
 * After a successful sign-in or refresh made from this page, the returned
 * access token is applied to every later request, so trying the API does not
 * start with copying a token into a dialog.
 */
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Print Procurement Portal API</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
    <style>
      body { margin: 0; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(SPEC_URL)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        docExpansion: 'none',
        defaultModelsExpandDepth: 0,
        responseInterceptor: function (response) {
          try {
            var path = new URL(response.url, window.location.href).pathname
            if (response.ok && /\\/api\\/v1\\/auth\\/(login|refresh)$/.test(path)) {
              var body = response.body || response.obj
              if (body && typeof body.accessToken === 'string') {
                window.ui.preauthorizeApi('bearerAuth', body.accessToken)
              }
            }
          } catch (ignored) {}
          return response
        },
      })
    </script>
  </body>
</html>
`

/**
 * GET /api/docs
 *
 * Interactive documentation for this API. Answers 404 when SWAGGER_ENABLED is
 * false, and always in production.
 */
export const GET = publicRoute(({ requestId }) => {
  if (!getConfig().docs.enabled) throw new NotFoundError('Page')

  return new Response(PAGE, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      [REQUEST_ID_HEADER]: requestId,
    },
  })
})
