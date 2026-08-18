// Base de Dados de Cursos de Idiomas - Viva Mais Teen (Cursos de Teste / Demonstração)

export const DEFAULT_TEEN_COURSES = [
  {
    id: 'course-en-demo',
    title: 'Inglês Prático para Viagens & Conversação (Curso Teste)',
    language: 'Inglês',
    languageCode: 'en',
    flag: '🇬🇧',
    level: 'Iniciante ao Intermediário',
    levelBadge: 'A1 - B1',
    category: 'Viagens',
    tag: 'CURSO DE TESTE ✈️',
    instructor: {
      name: 'Sarah Jenkins',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      role: 'Instrutora de Idiomas Viva Mais'
    },
    rating: 4.9,
    totalHours: '12h',
    banner: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1000&auto=format&fit=crop&q=80',
    description: 'Curso de teste para demonstração da plataforma. Aprenda vocabulário essencial para aeroportos, alfândega, hotéis e conversação do dia a dia.',
    modules: [
      {
        id: 'mod-en-demo-1',
        order: 1,
        title: 'Módulo 1: Primeiros Passos no Aeroporto e Imigração',
        description: 'Vocabulário essencial para viagens internacionais e passagem pela alfândega.',
        lessons: [
          {
            id: 'les-en-demo-1-1',
            title: '1. Entrevista de Imigração e Alfândega sem Segredos',
            duration: '15 min',
            durationSeconds: 900,
            videoUrl: 'https://www.youtube.com/embed/juKd26qkNAw',
            thumbnail: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&auto=format&fit=crop&q=80',
            description: 'Como responder com clareza aos agentes de imigração e apresentar documentos.',
            transcript: 'Hello! Welcome to our English for Travel demonstration class...',
            vocabulary: [
              { term: 'Boarding pass', meaning: 'Cartão de embarque', example: 'Please have your passport and boarding pass ready.' },
              { term: 'Customs declaration', meaning: 'Declaração alfandegária', example: 'Fill in the customs declaration form before landing.' },
              { term: 'Luggage / Baggage', meaning: 'Bagagem', example: 'You can claim your baggage at carousel number 4.' }
            ],
            quiz: {
              question: 'Como se chama o documento que permite o embarque no avião?',
              options: ['Boarding pass', 'Passport cover', 'Luggage tag', 'Flight key'],
              correctIndex: 0,
              explanation: '"Boarding pass" é o cartão de embarque oficial para o voo!'
            }
          },
          {
            id: 'les-en-demo-1-2',
            title: '2. Check-in no Hotel e Pedindo Informações',
            duration: '18 min',
            durationSeconds: 1080,
            videoUrl: 'https://www.youtube.com/embed/juKd26qkNAw',
            thumbnail: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80',
            description: 'Diálogos práticos para recepção de hotel, chaves e horário de café da manhã.',
            transcript: 'Good afternoon. I have a reservation under the name of...',
            vocabulary: [
              { term: 'Reservation', meaning: 'Reserva confirmada', example: 'I have a reservation for three nights.' },
              { term: 'Keycard', meaning: 'Cartão-chave do quarto', example: 'Here is your keycard for room 302.' }
            ],
            quiz: {
              question: 'Qual termo representa o cartão-chave usado nos quartos de hotel?',
              options: ['Keycard', 'Room ticket', 'Door pass', 'Gate lock'],
              correctIndex: 0,
              explanation: '"Keycard" é o termo padrão para o cartão de acesso ao quarto de hotel.'
            }
          }
        ]
      }
    ],
    materials: [
      {
        id: 'mat-en-demo-1',
        title: 'Guia Rápido de Vocabulário para Viagens (PDF)',
        type: 'pdf',
        size: '2.4 MB',
        downloadUrl: '#',
        description: 'Material complementar com frases indispensáveis para sua próxima viagem.'
      }
    ]
  },

  {
    id: 'course-es-demo',
    title: 'Espanhol Essencial para Negócios & Conversação (Curso Teste)',
    language: 'Espanhol',
    languageCode: 'es',
    flag: '🇪🇸',
    level: 'Iniciante',
    levelBadge: 'A1 - A2',
    category: 'Empresarial',
    tag: 'CURSO DE TESTE 💼',
    instructor: {
      name: 'Carlos Mendoza',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      role: 'Professor de Espanhol Corporativo'
    },
    rating: 4.85,
    totalHours: '10h',
    banner: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1000&auto=format&fit=crop&q=80',
    description: 'Curso de teste focado em primeiros contatos profissionais, saudações formais e termos de negócios.',
    modules: [
      {
        id: 'mod-es-demo-1',
        order: 1,
        title: 'Módulo 1: Primeiros Contatos & Apresentação Comercial',
        description: 'Estruturas básicas de saudação, e-mails formais e apresentação da sua empresa.',
        lessons: [
          {
            id: 'les-es-demo-1-1',
            title: '1. Saudações Formais e Apresentação Pessoal',
            duration: '16 min',
            durationSeconds: 960,
            videoUrl: 'https://www.youtube.com/embed/juKd26qkNAw',
            thumbnail: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&auto=format&fit=crop&q=80',
            description: 'Como cumprimentar parceiros e apresentar suas competências em reuniões.',
            transcript: 'Buenos días a todos. En esta clase de demostración aprenderemos...',
            vocabulary: [
              { term: 'Mucho gusto', meaning: 'Muito prazer', example: 'Mucho gusto en conocerle, señor Mendoza.' },
              { term: 'Empresa', meaning: 'Empresa / Companhia', example: 'Nuestra empresa ofrece soluciones de salud y bienestar.' }
            ],
            quiz: {
              question: 'Qual é a resposta formal mais comum para "Mucho gusto"?',
              options: ['El gusto es mío', 'De nada', 'Hasta luego', 'Por favor'],
              correctIndex: 0,
              explanation: '"El gusto es mío" (O prazer é meu) é a resposta cordial e formal padrão.'
            }
          }
        ]
      }
    ],
    materials: [
      {
        id: 'mat-es-demo-1',
        title: 'Glossário Básico de Negócios em Espanhol (PDF)',
        type: 'pdf',
        size: '1.9 MB',
        downloadUrl: '#',
        description: 'Termos comerciais mais usados na América Latina e Espanha.'
      }
    ]
  }
]

export const TEEN_ACHIEVEMENTS = [
  { id: 'first_lesson', title: 'Primeira Aula!', icon: '🎯', desc: 'Completou sua primeira aula de teste', unlocked: true }
]
