// The sectors a company can choose at sign-up. The sector shapes how MIRA reads
// the company's incidents; the incidents themselves come only from the company's own imports.
export const SECTORS = {
  fintech: {
    id: 'fintech',
    label: 'Fintech',
    context: 'a fintech company (payments, UPI, card gateways, settlements, OTP, banking integrations)',
    testAlert: { alertname: 'PaymentSuccessRateLow', service: 'payments-api', summary: 'Payment success rate dropped below 90% in the last 5 minutes' },
  },
  ecommerce: {
    id: 'ecommerce',
    label: 'E-commerce',
    context: 'an e-commerce company (checkout, carts, catalog search, payments, orders, delivery)',
    testAlert: { alertname: 'CheckoutErrorsHigh', service: 'checkout-api', summary: 'Checkout is returning 5xx errors for more than 5% of requests' },
  },
  edtech: {
    id: 'edtech',
    label: 'EdTech',
    context: 'an EdTech company (live classes, online exams, results, learner accounts, fee payments)',
    testAlert: { alertname: 'ExamAutosaveFailing', service: 'exam-service', summary: 'Exam autosave requests are failing for more than 3% of learners' },
  },
};

export const sectorLabel = (id) => SECTORS[id]?.label || id;
