// Starter accounts an organization can switch on or off. Client-safe (no server imports).
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type OrgType = "nonprofit" | "business";

export interface CatalogAccount {
  key: string;
  name: string;
  type: AccountType;
  subtype?: string;
  defaultOn: boolean;
  required?: boolean;
  why: string;
  whyNot: string;
}

const shared: CatalogAccount[] = [
  {
    key: "checking",
    name: "Checking",
    type: "asset",
    subtype: "bank",
    defaultOn: true,
    required: true,
    why: "Your main bank account — where most money comes in and goes out.",
    whyNot: "Always needed so there's somewhere to record money.",
  },
  {
    key: "savings",
    name: "Savings",
    type: "asset",
    subtype: "bank",
    defaultOn: true,
    why: "Keep reserves separate from day-to-day money.",
    whyNot: "Skip it if you only have one bank account.",
  },
  {
    key: "petty_cash",
    name: "Petty Cash",
    type: "asset",
    subtype: "cash",
    defaultOn: true,
    why: "Track physical cash in a drawer or cash box.",
    whyNot: "Skip it if you never handle cash.",
  },
  {
    key: "credit_card",
    name: "Credit Card",
    type: "liability",
    subtype: "credit_card",
    defaultOn: true,
    why: "Record purchases on a card and what you still owe on it.",
    whyNot: "Skip it if the organization has no credit card.",
  },
  {
    key: "loan",
    name: "Loan Payable",
    type: "liability",
    defaultOn: false,
    why: "Track money borrowed and paid back over time.",
    whyNot: "Skip it if you have no loans.",
  },
];

export const ACCOUNT_CATALOG: Record<OrgType, CatalogAccount[]> = {
  nonprofit: [
    ...shared,
    {
      key: "net_assets",
      name: "Net Assets",
      type: "equity",
      defaultOn: true,
      required: true,
      why: "What the organization is worth — needed to balance the books.",
      whyNot: "Always needed; opening balances land here.",
    },
    {
      key: "pledges_receivable",
      name: "Pledges Receivable",
      type: "asset",
      subtype: "pledges_receivable",
      defaultOn: false,
      why: "Track gifts donors have promised but not paid yet.",
      whyNot:
        "Skip it if you only record gifts when the money arrives. It is added for you when you record your first pledge.",
    },
    {
      key: "donations",
      name: "Donations",
      type: "revenue",
      defaultOn: true,
      why: "Money given freely, with nothing sold in return.",
      whyNot: "Rarely skipped — most nonprofits receive donations.",
    },
    {
      key: "fundraising_sales",
      name: "Fundraising Sales",
      type: "revenue",
      defaultOn: true,
      why: "Money from things you sell to raise funds, like T-shirts or bake sales — kept separate from donations.",
      whyNot: "Skip it if you never sell anything to raise money.",
    },
    {
      key: "grants",
      name: "Grants",
      type: "revenue",
      defaultOn: true,
      why: "Money awarded by foundations or government, often with reporting rules.",
      whyNot: "Skip it if you don't apply for or receive grants.",
    },
    {
      key: "program_revenue",
      name: "Program Revenue",
      type: "revenue",
      defaultOn: true,
      why: "Fees people pay for your services or programs (classes, meals, events).",
      whyNot: "Skip it if your programs are always free.",
    },
    {
      key: "membership_dues",
      name: "Membership Dues",
      type: "revenue",
      defaultOn: false,
      why: "Regular payments from members.",
      whyNot: "Skip it if you don't have paying members.",
    },
    {
      key: "program_expenses",
      name: "Program Expenses",
      type: "expense",
      defaultOn: true,
      why: "Spending that directly delivers your mission — donors and filings often ask for this.",
      whyNot: "Rarely skipped.",
    },
    {
      key: "fundraising_expenses",
      name: "Fundraising Expenses",
      type: "expense",
      defaultOn: true,
      why: "Costs of raising money, like event costs or T-shirt stock.",
      whyNot: "Skip it if you don't spend money to fundraise.",
    },
    {
      key: "operating_expenses",
      name: "Operating Expenses",
      type: "expense",
      defaultOn: true,
      why: "General running costs: rent, utilities, insurance, admin.",
      whyNot: "Rarely skipped.",
    },
  ],
  business: [
    ...shared,
    {
      key: "owners_equity",
      name: "Owner's Equity",
      type: "equity",
      defaultOn: true,
      required: true,
      why: "What the owners have put in and kept in the business — needed to balance the books.",
      whyNot: "Always needed; opening balances land here.",
    },
    {
      key: "sales",
      name: "Sales",
      type: "revenue",
      defaultOn: true,
      why: "Money from selling products.",
      whyNot: "Skip it if you only sell services.",
    },
    {
      key: "services_revenue",
      name: "Services Revenue",
      type: "revenue",
      defaultOn: true,
      why: "Money from work you do for clients.",
      whyNot: "Skip it if you only sell products.",
    },
    {
      key: "other_income",
      name: "Other Income",
      type: "revenue",
      defaultOn: true,
      why: "Occasional income like interest or refunds that isn't your main business.",
      whyNot: "Skip it to keep things minimal.",
    },
    {
      key: "cogs",
      name: "Cost of Goods Sold",
      type: "expense",
      defaultOn: true,
      why: "What the products you sold cost you — shows your real profit per sale.",
      whyNot: "Skip it if you don't sell physical products.",
    },
    {
      key: "operating_expenses",
      name: "Operating Expenses",
      type: "expense",
      defaultOn: true,
      why: "General running costs: rent, software, supplies.",
      whyNot: "Rarely skipped.",
    },
    {
      key: "payroll",
      name: "Payroll",
      type: "expense",
      defaultOn: false,
      why: "Wages and payroll taxes for employees.",
      whyNot: "Skip it if you have no employees.",
    },
  ],
};

export function catalogFor(orgType: OrgType) {
  return ACCOUNT_CATALOG[orgType];
}

export function matchesCatalog(a: { name: string; type: string }, c: CatalogAccount) {
  return a.type === c.type && a.name.trim().toLowerCase() === c.name.toLowerCase();
}
