import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Packages the server must `require` at runtime rather than have bundled.
   *
   * All of them break when webpack/Turbopack tries to inline them:
   *   - `@prisma/client` loads a platform-specific query engine binary and
   *     reads schema files by path;
   *   - `@node-rs/argon2` is a native .node addon;
   *   - `pdfkit` reads its built-in font files off disk by relative path, which
   *     a bundler rewrites into nothing;
   *   - `exceljs` and `nodemailer` both do conditional requires that a bundle
   *     resolves wrongly;
   *   - `bcryptjs` is pure JS but is only ever reached from the same server
   *     path, and keeping it here avoids pulling it into a client chunk;
   *   - `sharp` is a native addon that also resolves its libvips binary at
   *     runtime, and `bullmq` loads its Lua scripts off disk by path.
   *
   * Leaving them out shows up as "Cannot find module .prisma/client/default", a
   * missing font, or a missing-binding error at request time — not at build
   * time, which is what makes the list worth stating explicitly.
   */
  serverExternalPackages: [
    '@prisma/client',
    '@node-rs/argon2',
    'bcryptjs',
    'pdfkit',
    'exceljs',
    'nodemailer',
    'sharp',
    'bullmq',
  ],
}

export default nextConfig
