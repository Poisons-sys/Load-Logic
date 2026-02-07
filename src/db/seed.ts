import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from './index'
import { companies, users } from './schema'
import { eq } from 'drizzle-orm'

/**
 * Seed mínimo (sin datos de ejemplo):
 * - Crea una empresa y un usuario admin SOLO si no existen.
 *
 * Personaliza estas variables via .env:
 *  SEED_COMPANY_NAME, SEED_COMPANY_RFC,
 *  SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
async function seed() {
  console.log('🌱 Seed mínimo (sin datos de ejemplo)')

  const companyName = process.env.SEED_COMPANY_NAME || 'LoadLogic S.A. de C.V.'
  const companyRfc = process.env.SEED_COMPANY_RFC || 'RFC1234567890'
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@local.test').toLowerCase()
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || '12345'
  const adminName = process.env.SEED_ADMIN_NAME || 'Administrador'

  // 1) Empresa
  let company = await db.query.companies.findFirst({ where: eq(companies.rfc, companyRfc) })
  if (!company) {
    const [created] = await db
      .insert(companies)
      .values({
        name: companyName,
        rfc: companyRfc,
        licenseType: 'matriz',
        maxUsers: 10,
        isActive: true,
      })
      .returning()
    company = created
    console.log(`✅ Empresa creada: ${company.name} (${company.rfc})`)
  } else {
    console.log(`ℹ️ Empresa ya existe: ${company.name} (${company.rfc})`)
  }

  // 2) Admin
  const existingAdmin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) })
  if (!existingAdmin) {
    const hashed = await bcrypt.hash(adminPassword, 10)
    await db.insert(users).values({
      email: adminEmail,
      password: hashed,
      name: adminName,
      role: 'admin',
      companyId: company.id,
      isActive: true,
    })
    console.log(`✅ Admin creado: ${adminEmail}`)
  } else {
    console.log(`ℹ️ Admin ya existe: ${adminEmail}`)
  }
}

seed()
  .then(() => {
    console.log('✅ Seed finalizado')
    process.exit(0)
  })
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
