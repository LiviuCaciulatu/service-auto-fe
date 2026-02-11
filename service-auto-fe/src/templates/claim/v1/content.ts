export const sections = {
  insuredData: 'Date asigurat',
  vehicleData: 'Date vehicul',
  eventData: 'Date eveniment',
  eventDescription: 'Descriere eveniment',
  declaration: 'Declarație',
  signature: 'Semnătură',
}

export const fields = {
  name: 'Nume și prenume',
  cnp: 'CNP',
  phone: 'Telefon',
  email: 'Email',
  policyNumber: 'Număr poliță',
  registrationNumber: 'Număr de înmatriculare',
  brandModel: 'Marcă / Model',
  vin: 'Serie șasiu',
  accidentDate: 'Data accidentului',
  accidentPlace: 'Locul accidentului',
  guilty: 'Vinovat',
  claimNumber: 'Număr dosar daună',
  eventDescription: 'Descrierea evenimentului',
}

export const legal = {
  title: 'Declarație legală',
  text: `
• Răspund de exactitatea, realitatea şi corectitudinea actelor depuse.
• Mă oblig să restituiesc despăgubirea primită, în cazul în care actele încheiate de organele de poliţie, de unităţile de pompieri sau de alte autorităţi competente să cerceteze evenimentele asigurate sunt anulate.
• DECLAR PE PROPRIE RĂSPUNDERE CĂ NU MAI POSEDE ACELAŞI TIP DE ASIGURARE PENTRU ACEST AUTOVEHICUL ÎNCHEIATĂ ŞI LA ALTE SOCIETĂŢI DE ASIGURARE.
• DECLAR PE PROPRIE RĂSPUNDERE CĂ NU MAI PRETIND DESPĂGUBIRI PENTRU ACEST EVENIMENT DE LA O ALTĂ SOCIETATE DE ASIGURĂRI SAU DE LA PERSOANA VINOVATĂ.
• Cerere de plată formulată şi completată în baza prevederilor Legii 132/2017 şi a Normei ASF 20/2017.
• În caz de neachitare integrală în termenul prevăzut de lege, asigurătorul intră sub incidenţa art. 21, al. 5 din Legea 132/2017 şi va fi obligat la plata penalităţilor de întârziere de 0,2% pe zi.`,
}

export const footer = {
  companyName: 'Nume companie',
  templateVersion: 'v1',
  pageNumber: 'Pagina',
  dateGenerated: 'Data generării',
}

export default {
  sections,
  fields,
  legal,
  footer,
}
