import { PrismaClient } from '.prisma/field-app-client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a test shop
  const shop = await prisma.shop.upsert({
    where: { shopifyDomain: 'test-store.myshopify.com' },
    update: {},
    create: {
      shopifyDomain: 'test-store.myshopify.com',
      shopName: 'Test Store',
      accessToken: 'shpat_test_token_placeholder',
      scopes: 'read_products,write_orders,read_companies,write_companies',
      paymentStrategy: 'SHOPIFY_TERMS',
      isActive: true,
      hasManagedCompanies: false, // Test as non-Plus store with internal companies
    },
  });

  console.log('Created shop:', shop.shopifyDomain);

  // Create a test sales rep
  const passwordHash = await bcrypt.hash('password123', 12);

  const salesRep = await prisma.salesRep.upsert({
    where: {
      shopId_email: {
        shopId: shop.id,
        email: 'rep@test.com',
      },
    },
    update: {},
    create: {
      shopId: shop.id,
      email: 'rep@test.com',
      firstName: 'Test',
      lastName: 'Rep',
      phone: '+1234567890',
      role: 'REP',
      passwordHash,
      isActive: true,
    },
  });

  console.log('Created sales rep:', salesRep.email);

  // Create an admin user
  const adminRep = await prisma.salesRep.upsert({
    where: {
      shopId_email: {
        shopId: shop.id,
        email: 'admin@test.com',
      },
    },
    update: {},
    create: {
      shopId: shop.id,
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      passwordHash,
      isActive: true,
    },
  });

  console.log('Created admin:', adminRep.email);

  // Create a test territory
  const territory = await prisma.territory.upsert({
    where: { id: 'test-territory-1' },
    update: {},
    create: {
      id: 'test-territory-1',
      shopId: shop.id,
      name: 'West Coast',
      description: 'California, Oregon, Washington',
      isActive: true,
    },
  });

  console.log('Created territory:', territory.name);

  // Add some zip codes to the territory
  const zipcodes = ['90210', '90211', '94102', '94103', '97201', '98101'];
  for (const zipcode of zipcodes) {
    await prisma.territoryZipcode.upsert({
      where: {
        territoryId_zipcode: {
          territoryId: territory.id,
          zipcode,
        },
      },
      update: {},
      create: {
        territoryId: territory.id,
        zipcode,
      },
    });
  }

  console.log('Added zip codes to territory');

  // Assign sales rep to territory
  await prisma.repTerritory.upsert({
    where: {
      repId_territoryId: {
        repId: salesRep.id,
        territoryId: territory.id,
      },
    },
    update: {},
    create: {
      repId: salesRep.id,
      territoryId: territory.id,
      isPrimary: true,
    },
  });

  console.log('Assigned rep to territory');

  // Create a test internal company (non-Plus store, so no shopifyCompanyId)
  const company = await prisma.company.create({
    data: {
      shopId: shop.id,
      // shopifyCompanyId: null - internal company
      name: 'Acme Corporation',
      accountNumber: 'ACME-001',
      paymentTerms: 'NET_30',
      territoryId: territory.id,
      assignedRepId: salesRep.id,
      isActive: true,
    },
  });

  console.log('Created test company:', company.name);

  // Add a location to the company
  const location = await prisma.companyLocation.create({
    data: {
      companyId: company.id,
      name: 'Headquarters',
      isPrimary: true,
      address1: '123 Main Street',
      address2: 'Suite 100',
      city: 'Beverly Hills',
      province: 'California',
      provinceCode: 'CA',
      zipcode: '90210',
      country: 'United States',
      countryCode: 'US',
      phone: '+1-310-555-0100',
      isShippingAddress: true,
      isBillingAddress: true,
    },
  });

  console.log('Created company location:', location.name);

  // Add a contact to the company
  const contact = await prisma.companyContact.create({
    data: {
      companyId: company.id,
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@acme.com',
      phone: '+1-310-555-0101',
      title: 'Purchasing Manager',
      isPrimary: true,
      canPlaceOrders: true,
    },
  });

  console.log('Created company contact:', contact.email);

  console.log('\n✅ Seed completed successfully!');
  console.log('\nTest credentials:');
  console.log('  Email: rep@test.com');
  console.log('  Password: password123');
  console.log('\n  Email: admin@test.com');
  console.log('  Password: password123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
