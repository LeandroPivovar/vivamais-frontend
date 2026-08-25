<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { teenStorage } from './services/teenStorage'

const props = defineProps({
  layoutMode: {
    type: String,
    default: 'desktop'
  },
  embedded: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['triggerDevModal', 'closeAdmin'])

// Estado local
const courses = ref([])
const activeAdminSubTab = ref('courses') // 'courses' | 'modules' | 'materials'
const selectedCourseId = ref('')
const selectedModuleId = ref('')
const searchTerm = ref('')
const selectedLanguageFilter = ref('todos')

// Modais
const showCourseModal = ref(false)
const showModuleModal = ref(false)
const showLessonModal = ref(false)
const showMaterialModal = ref(false)
const isEditing = ref(false)

// Formulários
const courseForm = ref({
  id: '',
  title: '',
  language: 'Inglês',
  flag: '🇺🇸',
  level: 'Iniciante ao Intermediário',
  levelBadge: 'A1 - B1',
  category: 'Games & Pop',
  tag: 'NOVO 🔥',
  instructor: {
    name: 'Professor Teen',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'Especialista em Idiomas'
  },
  rating: 5.0,
  totalHours: '20h',
  banner: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
  description: ''
})

const moduleForm = ref({
  id: '',
  order: 1,
  title: '',
  description: ''
})

const lessonForm = ref({
  id: '',
  title: '',
  duration: '45 min',
  durationSeconds: 2700,
  videoUrl: 'https://www.youtube.com/embed/juKd26qkNAw',
  thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
  description: '',
  liveDate: '2026-08-20T19:00',
  formattedDate: '20/08 às 19:00',
  status: 'agendada' // 'ao_vivo' | 'agendada' | 'concluida'
})

const materialForm = ref({
  id: '',
  title: '',
  type: 'pdf',
  size: '2.5 MB',
  downloadUrl: '#',
  description: ''
})

// Idiomas e bandeiras suportadas
const LANGUAGE_OPTIONS = [
  { label: 'Inglês', flag: '🇺🇸', code: 'en' },
  { label: 'Espanhol', flag: '🇪🇸', code: 'es' },
  { label: 'Francês', flag: '🇫🇷', code: 'fr' },
  { label: 'Japonês', flag: '🇯🇵', code: 'ja' },
  { label: 'Alemão', flag: '🇩🇪', code: 'de' },
  { label: 'Italiano', flag: '🇮🇹', code: 'it' },
  { label: 'Coreano', flag: '🇰🇷', code: 'ko' },
  { label: 'Mandarim', flag: '🇨🇳', code: 'zh' }
]

function loadData() {
  courses.value = teenStorage.getCourses()
  if (!selectedCourseId.value && courses.value.length > 0) {
    selectedCourseId.value = courses.value[0].id
  }
}

onMounted(() => {
  loadData()
  window.addEventListener('teen-courses-updated', loadData)
})

onBeforeUnmount(() => {
  window.removeEventListener('teen-courses-updated', loadData)
})

// Computados
const selectedCourse = computed(() => {
  return courses.value.find(c => c.id === selectedCourseId.value) || courses.value[0] || null
})

const filteredCourses = computed(() => {
  let list = courses.value || []
  if (selectedLanguageFilter.value !== 'todos') {
    list = list.filter(c => c.language === selectedLanguageFilter.value)
  }
  if (searchTerm.value.trim()) {
    const s = searchTerm.value.toLowerCase()
    list = list.filter(c => c.title.toLowerCase().includes(s) || (c.description && c.description.toLowerCase().includes(s)))
  }
  return list
})

const totalCoursesCount = computed(() => courses.value.length)
const totalModulesCount = computed(() => courses.value.reduce((acc, c) => acc + (c.modules?.length || 0), 0))
const totalLessonsCount = computed(() => {
  return courses.value.reduce((acc, c) => {
    return acc + (c.modules || []).reduce((mAcc, m) => mAcc + (m.lessons?.length || 0), 0)
  }, 0)
})
const totalMaterialsCount = computed(() => courses.value.reduce((acc, c) => acc + (c.materials?.length || 0), 0))

// --- MÉTODOS DE CURSO ---
function openNewCourseModal() {
  isEditing.value = false
  courseForm.value = {
    id: `course-${Date.now()}`,
    title: '',
    language: 'Inglês',
    flag: '🇺🇸',
    level: 'Iniciante ao Intermediário',
    levelBadge: 'A1 - B1',
    category: 'Games & Pop',
    tag: 'NOVO 🔥',
    instructor: {
      name: 'Professor(a) Teen',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'Especialista em Idiomas'
    },
    rating: 5.0,
    totalHours: '15h',
    banner: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    description: ''
  }
  showCourseModal.value = true
}

function openEditCourseModal(course) {
  isEditing.value = true
  courseForm.value = JSON.parse(JSON.stringify(course))
  showCourseModal.value = true
}

function handleLanguageChange() {
  const found = LANGUAGE_OPTIONS.find(l => l.label === courseForm.value.language)
  if (found) {
    courseForm.value.flag = found.flag
  }
}

function saveCourse() {
  if (!courseForm.value.title.trim()) {
    alert('Por favor, informe o título do curso.')
    return
  }
  teenStorage.saveCourse(courseForm.value)
  showCourseModal.value = false
  loadData()
  emit('triggerDevModal', {
    title: isEditing.value ? 'Curso Atualizado!' : 'Novo Curso Criado!',
    message: `O curso "${courseForm.value.title}" foi salvo com sucesso no Viva Mais Teen.`
  })
}

function deleteCourse(course) {
  if (confirm(`Tem certeza que deseja excluir o curso "${course.title}" e todos seus módulos e aulas?`)) {
    teenStorage.deleteCourse(course.id)
    loadData()
    emit('triggerDevModal', {
      title: 'Curso Excluído',
      message: `O curso "${course.title}" foi removido do catálogo.`
    })
  }
}

// --- MÉTODOS DE MÓDULO ---
function openNewModuleModal() {
  if (!selectedCourse.value) return
  isEditing.value = false
  moduleForm.value = {
    id: `mod-${Date.now()}`,
    order: (selectedCourse.value.modules?.length || 0) + 1,
    title: '',
    description: ''
  }
  showModuleModal.value = true
}

function openEditModuleModal(mod) {
  isEditing.value = true
  moduleForm.value = JSON.parse(JSON.stringify(mod))
  showModuleModal.value = true
}

function saveModule() {
  if (!moduleForm.value.title.trim()) {
    alert('Por favor, informe o título do módulo.')
    return
  }
  teenStorage.saveModule(selectedCourse.value.id, moduleForm.value)
  showModuleModal.value = false
  loadData()
}

function deleteModule(mod) {
  if (confirm(`Deseja excluir o módulo "${mod.title}" e suas aulas?`)) {
    teenStorage.deleteModule(selectedCourse.value.id, mod.id)
    loadData()
  }
}

// --- MÉTODOS DE AULA AO VIVO ---
function openNewLessonModal(modId) {
  selectedModuleId.value = modId
  isEditing.value = false
  lessonForm.value = {
    id: `les-${Date.now()}`,
    title: '',
    duration: '45 min',
    durationSeconds: 2700,
    videoUrl: 'https://www.youtube.com/embed/juKd26qkNAw',
    thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
    description: '',
    liveDate: '2026-08-20T19:00',
    formattedDate: '20/08 às 19:00',
    status: 'agendada'
  }
  showLessonModal.value = true
}

function openEditLessonModal(modId, lesson) {
  selectedModuleId.value = modId
  isEditing.value = true

  lessonForm.value = {
    id: lesson.id,
    title: lesson.title,
    duration: lesson.duration || '45 min',
    durationSeconds: lesson.durationSeconds || 2700,
    videoUrl: lesson.videoUrl || '',
    thumbnail: lesson.thumbnail || '',
    description: lesson.description || '',
    liveDate: lesson.liveDate || '2026-08-20T19:00',
    formattedDate: lesson.formattedDate || '20/08 às 19:00',
    status: lesson.status || 'agendada'
  }
  showLessonModal.value = true
}

function saveLesson() {
  if (!lessonForm.value.title.trim()) {
    alert('Por favor, informe o título da aula ao vivo.')
    return
  }

  const lessonData = {
    id: lessonForm.value.id,
    title: lessonForm.value.title,
    duration: lessonForm.value.duration || '45 min',
    durationSeconds: Number(lessonForm.value.durationSeconds) || 2700,
    videoUrl: lessonForm.value.videoUrl,
    thumbnail: lessonForm.value.thumbnail,
    description: lessonForm.value.description,
    liveDate: lessonForm.value.liveDate,
    formattedDate: lessonForm.value.formattedDate,
    status: lessonForm.value.status || 'agendada',
    viewersCount: lessonForm.value.status === 'ao_vivo' ? 45 : 0
  }

  teenStorage.saveLesson(selectedCourse.value.id, selectedModuleId.value, lessonData)
  showLessonModal.value = false
  loadData()
  emit('triggerDevModal', {
    title: 'Aula Ao Vivo Salva!',
    message: `A aula "${lessonData.title}" foi salva com sucesso no cronograma do curso.`
  })
}

function deleteLesson(modId, lesson) {
  if (confirm(`Deseja excluir a aula "${lesson.title}"?`)) {
    teenStorage.deleteLesson(selectedCourse.value.id, modId, lesson.id)
    loadData()
  }
}

// --- MÉTODOS DE MATERIAIS ---
function openNewMaterialModal() {
  if (!selectedCourse.value) return
  isEditing.value = false
  materialForm.value = {
    id: `mat-${Date.now()}`,
    title: '',
    type: 'pdf',
    size: '2.5 MB',
    downloadUrl: '#',
    description: ''
  }
  showMaterialModal.value = true
}

function openEditMaterialModal(mat) {
  isEditing.value = true
  materialForm.value = JSON.parse(JSON.stringify(mat))
  showMaterialModal.value = true
}

function saveMaterial() {
  if (!materialForm.value.title.trim()) {
    alert('Por favor, informe o título do material.')
    return
  }
  teenStorage.saveMaterial(selectedCourse.value.id, materialForm.value)
  showMaterialModal.value = false
  loadData()
}

function deleteMaterial(mat) {
  if (confirm(`Deseja excluir o material "${mat.title}"?`)) {
    teenStorage.deleteMaterial(selectedCourse.value.id, mat.id)
    loadData()
  }
}

function resetAllData() {
  if (confirm('ATENÇÃO: Deseja restaurar todos os cursos de idiomas para os valores padrão de fábrica do Viva Mais Teen? Todas as alterações manuais serão resetadas.')) {
    teenStorage.resetToDefault()
    loadData()
    emit('triggerDevModal', {
      title: 'Dados Restaurados',
      message: 'Os cursos padrão de Inglês, Espanhol, Japonês, Francês e Alemão foram restaurados com sucesso!'
    })
  }
}
</script>

<template>
  <div class="teen-admin-container" :class="{ 'is-embedded': embedded }">
    
    <!-- Topo Admin Teen -->
    <header class="teen-admin-header">
      <div class="header-left">
        <div class="teen-badge-pill">
          <i class="ph ph-headphones"></i> VIVA MAIS TEEN • GESTÃO DE IDIOMAS
        </div>
        <h2>Painel de Controle de Cursos & Aulas</h2>
        <p>Cadastre e organize cursos, módulos, aulas em vídeo, vocabulário interativo e materiais de apoio para os adolescentes.</p>
      </div>

      <div class="header-actions">
        <button class="btn btn-teen-primary" @click="openNewCourseModal">
          <i class="ph ph-plus-circle"></i> Novo Curso de Idiomas
        </button>
        <button class="btn btn-outline" @click="resetAllData" title="Restaurar dados iniciais">
          <i class="ph ph-arrow-counter-clockwise"></i> Restaurar Padrões
        </button>
      </div>
    </header>

    <!-- Métricas Rápidas -->
    <div class="teen-admin-stats-grid">
      <div class="stat-card">
        <div class="stat-icon icon-blue"><i class="ph ph-globe"></i></div>
        <div class="stat-content">
          <span class="stat-label">Cursos de Idiomas</span>
          <strong class="stat-number">{{ totalCoursesCount }}</strong>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-purple"><i class="ph ph-folder-notch-open"></i></div>
        <div class="stat-content">
          <span class="stat-label">Módulos Criados</span>
          <strong class="stat-number">{{ totalModulesCount }}</strong>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-green"><i class="ph ph-video"></i></div>
        <div class="stat-content">
          <span class="stat-label">Aulas em Vídeo</span>
          <strong class="stat-number">{{ totalLessonsCount }}</strong>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon icon-amber"><i class="ph ph-file-pdf"></i></div>
        <div class="stat-content">
          <span class="stat-label">Materiais de Apoio</span>
          <strong class="stat-number">{{ totalMaterialsCount }}</strong>
        </div>
      </div>
    </div>

    <!-- Navegação de Sub-Abas do Admin Teen -->
    <div class="teen-admin-tabs">
      <button 
        class="teen-tab-btn" 
        :class="{ active: activeAdminSubTab === 'courses' }"
        @click="activeAdminSubTab = 'courses'"
      >
        <i class="ph ph-books"></i> 1. Cursos & Catálogo ({{ totalCoursesCount }})
      </button>

      <button 
        class="teen-tab-btn" 
        :class="{ active: activeAdminSubTab === 'modules' }"
        @click="activeAdminSubTab = 'modules'"
      >
        <i class="ph ph-tree-structure"></i> 2. Módulos & Aulas em Vídeo
      </button>

      <button 
        class="teen-tab-btn" 
        :class="{ active: activeAdminSubTab === 'materials' }"
        @click="activeAdminSubTab = 'materials'"
      >
        <i class="ph ph-download-simple"></i> 3. Materiais de Apoio & PDFs ({{ totalMaterialsCount }})
      </button>
    </div>

    <!-- SUB-ABA 1: GESTÃO DE CURSOS -->
    <section v-if="activeAdminSubTab === 'courses'" class="teen-admin-tab-body">
      <!-- Filtros da Tabela -->
      <div class="admin-filters-bar">
        <div class="search-input-wrapper">
          <i class="ph ph-magnifying-glass"></i>
          <input 
            v-model="searchTerm" 
            type="text" 
            placeholder="Buscar por título do curso ou assunto..."
            class="form-control"
          />
        </div>

        <select v-model="selectedLanguageFilter" class="form-control filter-select">
          <option value="todos">Todos os Idiomas</option>
          <option v-for="lang in LANGUAGE_OPTIONS" :key="lang.label" :value="lang.label">
            {{ lang.flag }} {{ lang.label }}
          </option>
        </select>
      </div>

      <!-- Grid de Cursos para Administração -->
      <div class="admin-courses-grid">
        <div v-for="course in filteredCourses" :key="course.id" class="admin-course-card">
          <div class="course-card-banner" :style="{ backgroundImage: `url(${course.banner})` }">
            <span class="course-flag-badge">{{ course.flag }} {{ course.language }}</span>
            <span class="course-tag-badge">{{ course.tag }}</span>
          </div>

          <div class="course-card-content">
            <div class="course-meta-top">
              <span class="level-pill"><i class="ph ph-chart-bar"></i> {{ course.levelBadge }}</span>
              <span class="hours-pill"><i class="ph ph-clock"></i> {{ course.totalHours }}</span>
              <span class="rating-pill"><i class="ph ph-star-fill"></i> {{ course.rating }}</span>
            </div>

            <h3 class="course-card-title">{{ course.title }}</h3>
            <p class="course-card-desc">{{ course.description }}</p>

            <div class="course-summary-row">
              <span><i class="ph ph-folder"></i> {{ course.modules?.length || 0 }} Módulos</span>
              <span>
                <i class="ph ph-play-circle"></i> 
                {{ (course.modules || []).reduce((acc, m) => acc + (m.lessons?.length || 0), 0) }} Aulas
              </span>
              <span><i class="ph ph-file-text"></i> {{ course.materials?.length || 0 }} Materiais</span>
            </div>

            <div class="instructor-mini">
              <img :src="course.instructor?.avatar" :alt="course.instructor?.name" />
              <div>
                <strong>{{ course.instructor?.name }}</strong>
                <small>{{ course.instructor?.role }}</small>
              </div>
            </div>

            <div class="course-card-actions">
              <button 
                class="btn-admin-action btn-manage" 
                @click="selectedCourseId = course.id; activeAdminSubTab = 'modules'"
                title="Gerenciar Módulos e Aulas"
              >
                <i class="ph ph-list-dashes"></i> Gerenciar Aulas
              </button>
              <button 
                class="btn-admin-action btn-edit" 
                @click="openEditCourseModal(course)"
                title="Editar Informações do Curso"
              >
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button 
                class="btn-admin-action btn-delete" 
                @click="deleteCourse(course)"
                title="Excluir Curso"
              >
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
        </div>

        <div v-if="filteredCourses.length === 0" class="empty-admin-box">
          <i class="ph ph-magnifying-glass"></i>
          <h4>Nenhum curso encontrado</h4>
          <p>Tente alterar o filtro de busca ou cadastre um novo curso de idiomas.</p>
          <button class="btn btn-teen-primary" @click="openNewCourseModal">
            <i class="ph ph-plus-circle"></i> Cadastrar Novo Curso
          </button>
        </div>
      </div>
    </section>

    <!-- SUB-ABA 2: MÓDULOS & AULAS EM VÍDEO -->
    <section v-if="activeAdminSubTab === 'modules'" class="teen-admin-tab-body">
      <!-- Seletor do Curso Ativo -->
      <div class="course-selector-bar">
        <div class="selector-info">
          <label><i class="ph ph-book-open"></i> Curso Selecionado para Edição:</label>
          <select v-model="selectedCourseId" class="form-control selector-select">
            <option v-for="c in courses" :key="c.id" :value="c.id">
              {{ c.flag }} {{ c.title }} ({{ c.language }})
            </option>
          </select>
        </div>

        <button class="btn btn-teen-primary" @click="openNewModuleModal">
          <i class="ph ph-folder-plus"></i> Adicionar Módulo ao Curso
        </button>
      </div>

      <!-- Detalhes dos Módulos e Aulas do Curso Selecionado -->
      <div v-if="selectedCourse" class="modules-accordion-manager">
        <div 
          v-for="mod in selectedCourse.modules" 
          :key="mod.id" 
          class="module-manage-card"
        >
          <!-- Cabeçalho do Módulo -->
          <div class="module-header-row">
            <div class="module-title-area">
              <span class="module-order-badge">Módulo {{ mod.order }}</span>
              <h4>{{ mod.title }}</h4>
              <p v-if="mod.description">{{ mod.description }}</p>
            </div>

            <div class="module-header-actions">
              <button class="btn btn-sm btn-outline" @click="openNewLessonModal(mod.id)">
                <i class="ph ph-video-camera"></i> + Nova Aula
              </button>
              <button class="btn btn-sm btn-icon" @click="openEditModuleModal(mod)" title="Editar Módulo">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="btn btn-sm btn-icon text-red" @click="deleteModule(mod)" title="Excluir Módulo">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>

          <!-- Lista de Aulas Dentro do Módulo -->
          <div class="lessons-table-wrapper">
            <table v-if="mod.lessons && mod.lessons.length > 0" class="admin-lessons-table">
              <thead>
                <tr>
                  <th>Aula Ao Vivo / Título</th>
                  <th>Status Live</th>
                  <th>Data Agendada</th>
                  <th>Duração</th>
                  <th>Link do Vídeo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lesson in mod.lessons" :key="lesson.id">
                  <td>
                    <div class="lesson-cell-title">
                      <div class="lesson-thumb-mini" :style="{ backgroundImage: `url(${lesson.thumbnail || selectedCourse.banner})` }">
                        <i class="ph ph-play"></i>
                      </div>
                      <div>
                        <strong>{{ lesson.title }}</strong>
                        <small>{{ lesson.description?.slice(0, 70) }}...</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span v-if="lesson.status === 'ao_vivo'" class="badge-quiz-yes" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5;">
                      <i class="ph ph-broadcast"></i> AO VIVO
                    </span>
                    <span v-else-if="lesson.status === 'agendada'" class="badge-quiz-no" style="background: #FEF3C7; color: #D97706; border: 1px solid #FCD34D;">
                      <i class="ph ph-lock"></i> Agendada
                    </span>
                    <span v-else class="badge-quiz-no">
                      <i class="ph ph-video"></i> Concluída
                    </span>
                  </td>
                  <td>
                    <span class="duration-badge" style="font-weight: 600;">
                      <i class="ph ph-calendar"></i> {{ lesson.formattedDate || lesson.liveDate }}
                    </span>
                  </td>
                  <td>
                    <span class="duration-badge"><i class="ph ph-timer"></i> {{ lesson.duration }}</span>
                  </td>
                  <td>
                    <a :href="lesson.videoUrl" target="_blank" class="video-link-preview" :title="lesson.videoUrl">
                      <i class="ph ph-youtube-logo"></i> Link do Stream
                    </a>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button class="btn-icon-action" @click="openEditLessonModal(mod.id, lesson)" title="Editar Aula">
                        <i class="ph ph-pencil-simple"></i>
                      </button>
                      <button class="btn-icon-action text-red" @click="deleteLesson(mod.id, lesson)" title="Excluir Aula">
                        <i class="ph ph-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-else class="empty-lessons-box">
              <i class="ph ph-video-camera"></i>
              <p>Nenhuma aula cadastrada neste módulo ainda.</p>
              <button class="btn btn-sm btn-teen-primary" @click="openNewLessonModal(mod.id)">
                <i class="ph ph-plus"></i> Cadastrar Primeira Aula
              </button>
            </div>
          </div>
        </div>

        <div v-if="!selectedCourse.modules || selectedCourse.modules.length === 0" class="empty-admin-box">
          <i class="ph ph-folder-open"></i>
          <h4>Nenhum módulo neste curso</h4>
          <p>Crie o primeiro módulo temático para começar a adicionar aulas de vídeo.</p>
          <button class="btn btn-teen-primary" @click="openNewModuleModal">
            <i class="ph ph-folder-plus"></i> Criar Primeiro Módulo
          </button>
        </div>
      </div>
    </section>

    <!-- SUB-ABA 3: MATERIAIS DE APOIO & PDFS -->
    <section v-if="activeAdminSubTab === 'materials'" class="teen-admin-tab-body">
      <div class="course-selector-bar">
        <div class="selector-info">
          <label><i class="ph ph-book-open"></i> Curso Selecionado para Materiais:</label>
          <select v-model="selectedCourseId" class="form-control selector-select">
            <option v-for="c in courses" :key="c.id" :value="c.id">
              {{ c.flag }} {{ c.title }} ({{ c.language }})
            </option>
          </select>
        </div>

        <button class="btn btn-teen-primary" @click="openNewMaterialModal">
          <i class="ph ph-file-plus"></i> Adicionar Material de Apoio
        </button>
      </div>

      <div v-if="selectedCourse" class="materials-manage-grid">
        <div 
          v-for="mat in selectedCourse.materials" 
          :key="mat.id" 
          class="material-manage-card"
        >
          <div class="material-type-icon" :class="mat.type">
            <i v-if="mat.type === 'pdf'" class="ph ph-file-pdf"></i>
            <i v-else-if="mat.type === 'audio'" class="ph ph-music-notes"></i>
            <i v-else-if="mat.type === 'zip'" class="ph ph-file-zip"></i>
            <i v-else class="ph ph-file-text"></i>
          </div>

          <div class="material-card-info">
            <div class="material-tags-row">
              <span class="type-pill">{{ mat.type?.toUpperCase() }}</span>
              <span class="size-pill">{{ mat.size }}</span>
            </div>
            <h4>{{ mat.title }}</h4>
            <p>{{ mat.description }}</p>
          </div>

          <div class="material-card-actions">
            <button class="btn-icon-action" @click="openEditMaterialModal(mat)" title="Editar">
              <i class="ph ph-pencil-simple"></i>
            </button>
            <button class="btn-icon-action text-red" @click="deleteMaterial(mat)" title="Excluir">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </div>

        <div v-if="!selectedCourse.materials || selectedCourse.materials.length === 0" class="empty-admin-box">
          <i class="ph ph-file-pdf"></i>
          <h4>Nenhum material cadastrado neste curso</h4>
          <p>Adicione apostilas em PDF, áudios MP3 para listening ou flashcards.</p>
          <button class="btn btn-teen-primary" @click="openNewMaterialModal">
            <i class="ph ph-plus-circle"></i> Cadastrar Primeiro Material
          </button>
        </div>
      </div>
    </section>

    <!-- ================================================================= -->
    <!-- MODAL: CADASTRAR / EDITAR CURSO -->
    <!-- ================================================================= -->
    <div v-if="showCourseModal" class="teen-modal-overlay" @click.self="showCourseModal = false">
      <div class="teen-modal-card large-modal">
        <div class="teen-modal-header">
          <div class="modal-title-with-icon">
            <i class="ph ph-globe-hemisphere-west"></i>
            <h3>{{ isEditing ? 'Editar Curso de Idiomas' : 'Novo Curso de Idiomas' }}</h3>
          </div>
          <button class="modal-close-btn" @click="showCourseModal = false"><i class="ph ph-x"></i></button>
        </div>

        <form @submit.prevent="saveCourse" class="teen-modal-form">
          <div class="form-row-2">
            <div class="form-group">
              <label>Título do Curso *</label>
              <input 
                v-model="courseForm.title" 
                type="text" 
                placeholder="Ex: English for Gamers & Discord"
                class="form-control"
                required
              />
            </div>

            <div class="form-group">
              <label>Idioma Principal *</label>
              <select v-model="courseForm.language" @change="handleLanguageChange" class="form-control">
                <option v-for="opt in LANGUAGE_OPTIONS" :key="opt.label" :value="opt.label">
                  {{ opt.flag }} {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-row-3">
            <div class="form-group">
              <label>Nível</label>
              <input 
                v-model="courseForm.level" 
                type="text" 
                placeholder="Ex: Iniciante ao Intermediário"
                class="form-control"
              />
            </div>

            <div class="form-group">
              <label>Badge de Nível (Ex: A1 - B1)</label>
              <input 
                v-model="courseForm.levelBadge" 
                type="text" 
                placeholder="A1 - B1"
                class="form-control"
              />
            </div>

            <div class="form-group">
              <label>Carga Horária Estimada</label>
              <input 
                v-model="courseForm.totalHours" 
                type="text" 
                placeholder="Ex: 24h"
                class="form-control"
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>Categoria Temática</label>
              <input 
                v-model="courseForm.category" 
                type="text" 
                placeholder="Ex: Games & Pop / Música & Séries"
                class="form-control"
              />
            </div>

            <div class="form-group">
              <label>Tag / Destaque Visual</label>
              <input 
                v-model="courseForm.tag" 
                type="text" 
                placeholder="Ex: MAIS POPULAR 🔥 / NOVIDADE ⚡"
                class="form-control"
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>Nome do Instrutor(a)</label>
              <input 
                v-model="courseForm.instructor.name" 
                type="text" 
                placeholder="Ex: Alex Miller"
                class="form-control"
              />
            </div>

            <div class="form-group">
              <label>Cargo / Bio Curta do Instrutor</label>
              <input 
                v-model="courseForm.instructor.role" 
                type="text" 
                placeholder="Ex: Gamer & Professor Nativo"
                class="form-control"
              />
            </div>
          </div>

          <div class="form-group">
            <label>URL da Imagem de Banner / Capa do Curso</label>
            <input 
              v-model="courseForm.banner" 
              type="url" 
              placeholder="https://images.unsplash.com/..."
              class="form-control"
            />
          </div>

          <div class="form-group">
            <label>Descrição Completa do Curso</label>
            <textarea 
              v-model="courseForm.description" 
              rows="3" 
              placeholder="Explique o que o adolescente vai aprender e os diferenciais práticos..."
              class="form-control"
            ></textarea>
          </div>

          <div class="teen-modal-actions">
            <button type="button" class="btn btn-outline" @click="showCourseModal = false">Cancelar</button>
            <button type="submit" class="btn btn-teen-primary">
              <i class="ph ph-floppy-disk"></i> {{ isEditing ? 'Salvar Alterações' : 'Criar Curso' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL: CADASTRAR / EDITAR MÓDULO -->
    <!-- ================================================================= -->
    <div v-if="showModuleModal" class="teen-modal-overlay" @click.self="showModuleModal = false">
      <div class="teen-modal-card">
        <div class="teen-modal-header">
          <div class="modal-title-with-icon">
            <i class="ph ph-folder-notch-open"></i>
            <h3>{{ isEditing ? 'Editar Módulo' : 'Novo Módulo do Curso' }}</h3>
          </div>
          <button class="modal-close-btn" @click="showModuleModal = false"><i class="ph ph-x"></i></button>
        </div>

        <form @submit.prevent="saveModule" class="teen-modal-form">
          <div class="form-group">
            <label>Ordem do Módulo</label>
            <input v-model.number="moduleForm.order" type="number" min="1" class="form-control" />
          </div>

          <div class="form-group">
            <label>Título do Módulo *</label>
            <input 
              v-model="moduleForm.title" 
              type="text" 
              placeholder="Ex: Módulo 1: Call do Discord & Slangs Essenciais"
              class="form-control"
              required
            />
          </div>

          <div class="form-group">
            <label>Descrição do Módulo</label>
            <textarea 
              v-model="moduleForm.description" 
              rows="2" 
              placeholder="Resumo dos temas abordados neste módulo..."
              class="form-control"
            ></textarea>
          </div>

          <div class="teen-modal-actions">
            <button type="button" class="btn btn-outline" @click="showModuleModal = false">Cancelar</button>
            <button type="submit" class="btn btn-teen-primary">
              <i class="ph ph-floppy-disk"></i> Salvar Módulo
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL: CADASTRAR / EDITAR AULA -->
    <!-- ================================================================= -->
    <div v-if="showLessonModal" class="teen-modal-overlay" @click.self="showLessonModal = false">
      <div class="teen-modal-card large-modal">
        <div class="teen-modal-header">
          <div class="modal-title-with-icon">
            <i class="ph ph-video-camera"></i>
            <h3>{{ isEditing ? 'Editar Aula em Vídeo' : 'Nova Aula em Vídeo' }}</h3>
          </div>
          <button class="modal-close-btn" @click="showLessonModal = false"><i class="ph ph-x"></i></button>
        </div>

        <form @submit.prevent="saveLesson" class="teen-modal-form">
          <div class="form-row-2">
            <div class="form-group">
              <label>Título da Aula *</label>
              <input 
                v-model="lessonForm.title" 
                type="text" 
                placeholder="Ex: 1. Apresentando-se na call e gírias de games"
                class="form-control"
                required
              />
            </div>

            <div class="form-group">
              <label>Duração da Aula (Ex: 45 min)</label>
              <input 
                v-model="lessonForm.duration" 
                type="text" 
                placeholder="45 min"
                class="form-control"
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>Status da Aula Ao Vivo *</label>
              <select v-model="lessonForm.status" class="form-control">
                <option value="agendada">🔒 Agendada (Bloqueada até a live)</option>
                <option value="ao_vivo">🔴 AO VIVO AGORA (Liberada)</option>
                <option value="concluida">📹 Concluída (Gravação Disponível)</option>
              </select>
            </div>

            <div class="form-group">
              <label>Data e Horário de Exibição / Live *</label>
              <input 
                v-model="lessonForm.formattedDate" 
                type="text" 
                placeholder="Ex: Hoje às 19:00 ou 20/08 às 19:30"
                class="form-control"
                required
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>URL do Vídeo / Live Stream (Embed YouTube ou MP4) *</label>
              <input 
                v-model="lessonForm.videoUrl" 
                type="url" 
                placeholder="https://www.youtube.com/embed/..."
                class="form-control"
                required
              />
            </div>

            <div class="form-group">
              <label>Thumbnail / Miniatura do Vídeo</label>
              <input 
                v-model="lessonForm.thumbnail" 
                type="url" 
                placeholder="https://images.unsplash.com/..."
                class="form-control"
              />
            </div>
          </div>

          <div class="form-group">
            <label>Descrição / Tópicos da Aula Ao Vivo</label>
            <textarea 
              v-model="lessonForm.description" 
              rows="3" 
              placeholder="Explique o que será abordado na transmissão ao vivo com os alunos..."
              class="form-control"
            ></textarea>
          </div>

          <div class="teen-modal-actions">
            <button type="button" class="btn btn-outline" @click="showLessonModal = false">Cancelar</button>
            <button type="submit" class="btn btn-teen-primary">
              <i class="ph ph-floppy-disk"></i> Salvar Aula Ao Vivo
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL: CADASTRAR / EDITAR MATERIAL DE APOIO -->
    <!-- ================================================================= -->
    <div v-if="showMaterialModal" class="teen-modal-overlay" @click.self="showMaterialModal = false">
      <div class="teen-modal-card">
        <div class="teen-modal-header">
          <div class="modal-title-with-icon">
            <i class="ph ph-file-pdf"></i>
            <h3>{{ isEditing ? 'Editar Material de Apoio' : 'Novo Material de Apoio' }}</h3>
          </div>
          <button class="modal-close-btn" @click="showMaterialModal = false"><i class="ph ph-x"></i></button>
        </div>

        <form @submit.prevent="saveMaterial" class="teen-modal-form">
          <div class="form-group">
            <label>Título do Arquivo / Material *</label>
            <input 
              v-model="materialForm.title" 
              type="text" 
              placeholder="Ex: Guia de Gírias Gamer & Discord (PDF)"
              class="form-control"
              required
            />
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>Tipo de Arquivo</label>
              <select v-model="materialForm.type" class="form-control">
                <option value="pdf">📄 Documento PDF</option>
                <option value="audio">🎧 Áudio MP3 / Listening</option>
                <option value="zip">📦 Pacote ZIP / Flashcards</option>
                <option value="ebook">📚 E-book Digital</option>
              </select>
            </div>

            <div class="form-group">
              <label>Tamanho do Arquivo (Ex: 3.4 MB)</label>
              <input 
                v-model="materialForm.size" 
                type="text" 
                placeholder="Ex: 3.4 MB"
                class="form-control"
              />
            </div>
          </div>

          <div class="form-group">
            <label>URL de Download do Arquivo</label>
            <input 
              v-model="materialForm.downloadUrl" 
              type="text" 
              placeholder="https://... ou #"
              class="form-control"
            />
          </div>

          <div class="form-group">
            <label>Descrição do Conteúdo do Material</label>
            <textarea 
              v-model="materialForm.description" 
              rows="2" 
              placeholder="Resumo do que o aluno encontrará neste download..."
              class="form-control"
            ></textarea>
          </div>

          <div class="teen-modal-actions">
            <button type="button" class="btn btn-outline" @click="showMaterialModal = false">Cancelar</button>
            <button type="submit" class="btn btn-teen-primary">
              <i class="ph ph-floppy-disk"></i> Salvar Material
            </button>
          </div>
        </form>
      </div>
    </div>

    <nav v-if="embedded" class="teen-admin-bottom-nav">
      <button class="teen-bottom-tab return-tab" @click="emit('closeAdmin')">
        <i class="ph ph-arrow-left"></i>
        <span>Voltar</span>
      </button>
      <button
        :class="['teen-bottom-tab', { active: activeAdminSubTab === 'courses' }]"
        @click="activeAdminSubTab = 'courses'"
      >
        <i class="ph ph-books"></i>
        <span>Cursos</span>
      </button>
      <button
        :class="['teen-bottom-tab', { active: activeAdminSubTab === 'modules' }]"
        @click="activeAdminSubTab = 'modules'"
      >
        <i class="ph ph-tree-structure"></i>
        <span>Módulos</span>
      </button>
      <button
        :class="['teen-bottom-tab', { active: activeAdminSubTab === 'materials' }]"
        @click="activeAdminSubTab = 'materials'"
      >
        <i class="ph ph-download-simple"></i>
        <span>Materiais</span>
      </button>
    </nav>

  </div>
</template>

<style scoped>
.teen-admin-container {
  padding: 24px;
  background: #f8fafc;
  min-height: 100%;
}

.teen-admin-container.is-embedded {
  padding: 0;
  background: transparent;
}

/* Header */
.teen-admin-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  background: white;
  padding: 24px 28px;
  border-radius: var(--radius-lg, 16px);
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);
  margin-bottom: 24px;
}

.teen-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #eff6ff;
  color: #2563eb;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.teen-admin-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}

.teen-admin-header p {
  font-size: 13px;
  color: #64748b;
  max-width: 650px;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-teen-primary {
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: white;
  border: none;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}

.btn-teen-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

/* Stats */
.teen-admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.icon-blue { background: #dbeafe; color: #1d4ed8; }
.stat-icon.icon-purple { background: #f3e8ff; color: #7e22ce; }
.stat-icon.icon-green { background: #dcfce7; color: #15803d; }
.stat-icon.icon-amber { background: #fef3c7; color: #b45309; }

.stat-label {
  font-size: 12px;
  color: #64748b;
  display: block;
}

.stat-number {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}

/* Sub-Abas */
.teen-admin-tabs {
  display: flex;
  gap: 8px;
  background: #f1f5f9;
  padding: 6px;
  border-radius: 12px;
  margin-bottom: 24px;
  overflow-x: auto;
}

.teen-tab-btn {
  flex: 1;
  min-width: 180px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 600;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.teen-tab-btn.active {
  background: white;
  color: #2563eb;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.teen-admin-bottom-nav {
  display: none;
}

.teen-bottom-tab {
  border: none;
  background: transparent;
  color: #64748b;
  min-width: 78px;
  padding: 8px 10px;
  border-radius: 16px;
  cursor: pointer;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  transition: all 0.2s ease;
}

.teen-bottom-tab i {
  font-size: 21px;
}

.teen-bottom-tab.active {
  background: #eff6ff;
  color: #2563eb;
}

.teen-bottom-tab.return-tab {
  color: #0f172a;
}

@media (max-width: 1366px) {
  .teen-admin-container.is-embedded {
    padding-bottom: 92px;
  }

  .teen-admin-container.is-embedded .teen-admin-tabs {
    display: none;
  }

  .teen-admin-container.is-embedded .teen-admin-bottom-nav {
    position: fixed;
    left: max(12px, env(safe-area-inset-left));
    right: max(12px, env(safe-area-inset-right));
    bottom: max(10px, env(safe-area-inset-bottom));
    z-index: 1003;
    display: flex;
    justify-content: center;
    gap: 6px;
    overflow-x: auto;
    padding: 8px;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid #e2e8f0;
    border-radius: 22px;
    box-shadow: 0 16px 42px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(14px);
  }

  .teen-admin-container.is-embedded .teen-bottom-tab {
    flex: 1 0 76px;
  }

  .teen-admin-container.is-embedded .course-selector-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .teen-admin-container.is-embedded .selector-info {
    width: 100%;
    min-width: 0;
    flex-direction: column;
    align-items: stretch;
  }

  .teen-admin-container.is-embedded .selector-info label {
    white-space: normal;
    line-height: 1.35;
  }

  .teen-admin-container.is-embedded .selector-select,
  .teen-admin-container.is-embedded .course-selector-bar .btn {
    width: 100%;
  }

  .teen-admin-container.is-embedded .teen-admin-header {
    flex-direction: column;
    align-items: stretch;
  }

  .teen-admin-container.is-embedded .header-actions {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .teen-admin-container.is-embedded .header-actions .btn {
    width: 100%;
    justify-content: center;
    min-height: 52px;
    white-space: normal;
  }
}

@media (min-width: 768px) and (max-width: 1366px) {
  .teen-admin-container.is-embedded .teen-admin-bottom-nav {
    left: 50%;
    right: auto;
    width: min(520px, calc(100vw - 32px));
    transform: translateX(-50%);
  }
}

/* Filtros */
.admin-filters-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 260px;
}

.search-input-wrapper i {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.search-input-wrapper input {
  padding-left: 40px;
  border-radius: 10px;
}

.filter-select {
  width: auto;
  min-width: 180px;
  border-radius: 10px;
}

/* Grid de Cursos */
.admin-courses-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.admin-course-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  display: flex;
  flex-direction: column;
}

.course-card-banner {
  height: 140px;
  background-size: cover;
  background-position: center;
  position: relative;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.course-card-banner::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
}

.course-flag-badge, .course-tag-badge {
  position: relative;
  z-index: 2;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}

.course-flag-badge {
  background: rgba(15, 23, 42, 0.85);
  color: white;
  backdrop-filter: blur(4px);
}

.course-tag-badge {
  background: #f59e0b;
  color: #78350f;
}

.course-card-content {
  padding: 18px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.course-meta-top {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.level-pill, .hours-pill, .rating-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.level-pill { background: #f1f5f9; color: #475569; }
.hours-pill { background: #f0fdf4; color: #166534; }
.rating-pill { background: #fefce8; color: #854d0e; }

.course-card-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.course-card-desc {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #475569;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 12px;
}

.instructor-mini {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.instructor-mini img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.instructor-mini strong {
  font-size: 12px;
  color: #0f172a;
  display: block;
}

.instructor-mini small {
  font-size: 11px;
  color: #64748b;
  display: block;
}

.course-card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.btn-admin-action {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-admin-action.btn-manage {
  flex: 1;
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.btn-admin-action.btn-manage:hover {
  background: #2563eb;
  color: white;
}

.btn-admin-action.btn-edit:hover {
  background: #f8fafc;
  color: #0f172a;
}

.btn-admin-action.btn-delete:hover {
  background: #fef2f2;
  color: #ef4444;
  border-color: #fecaca;
}

/* Seletor de Curso */
.course-selector-bar {
  background: white;
  padding: 16px 20px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.selector-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 280px;
}

.selector-info label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
}

.selector-select {
  flex: 1;
  border-radius: 10px;
  font-weight: 600;
}

/* Accordion de Módulos */
.modules-accordion-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-manage-card {
  background: white;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.02);
}

.module-header-row {
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.module-order-badge {
  font-size: 11px;
  font-weight: 700;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 8px;
  border-radius: 6px;
  display: inline-block;
  margin-bottom: 4px;
}

.module-title-area h4 {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.module-title-area p {
  font-size: 12px;
  color: #64748b;
}

.module-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Tabela de Aulas */
.lessons-table-wrapper {
  padding: 0;
  overflow-x: auto;
}

.admin-lessons-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-lessons-table th {
  background: white;
  color: #64748b;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
}

.admin-lessons-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.lesson-cell-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lesson-thumb-mini {
  width: 48px;
  height: 32px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  position: relative;
}

.lesson-thumb-mini::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.3);
  border-radius: 6px;
}

.lesson-thumb-mini i {
  position: relative;
  z-index: 1;
}

.lesson-cell-title strong {
  display: block;
  color: #0f172a;
  font-size: 13px;
}

.lesson-cell-title small {
  color: #64748b;
  font-size: 11px;
}

.duration-badge {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  padding: 3px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.video-link-preview {
  color: #ef4444;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: underline;
}

.badge-count {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
}

.badge-count.badge-empty {
  background: #f1f5f9;
  color: #94a3b8;
}

.badge-quiz-yes {
  font-size: 11px;
  font-weight: 600;
  color: #16a34a;
  background: #dcfce7;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.badge-quiz-no {
  font-size: 11px;
  color: #94a3b8;
}

.table-actions {
  display: flex;
  gap: 6px;
}

.btn-icon-action {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #475569;
}

.btn-icon-action:hover {
  background: #f8fafc;
  color: #0f172a;
}

.btn-icon-action.text-red:hover {
  background: #fef2f2;
  color: #ef4444;
}

/* Materiais Grid */
.materials-manage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.material-manage-card {
  background: white;
  padding: 18px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.material-type-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.material-type-icon.pdf { background: #fee2e2; color: #dc2626; }
.material-type-icon.audio { background: #f3e8ff; color: #7e22ce; }
.material-type-icon.zip { background: #fef3c7; color: #d97706; }
.material-type-icon.ebook { background: #dbeafe; color: #2563eb; }

.material-card-info {
  flex: 1;
}

.material-tags-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.type-pill, .size-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.type-pill { background: #f1f5f9; color: #475569; }
.size-pill { background: #f0fdf4; color: #166534; }

.material-card-info h4 {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}

.material-card-info p {
  font-size: 12px;
  color: #64748b;
}

.material-card-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Modais */
.teen-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.teen-modal-card {
  background: white;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  border-radius: 20px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.teen-modal-card.large-modal {
  max-width: 780px;
}

.teen-modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
}

.modal-title-with-icon {
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title-with-icon i {
  font-size: 22px;
  color: #2563eb;
}

.modal-title-with-icon h3 {
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
}

.modal-close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #94a3b8;
  cursor: pointer;
}

.teen-modal-form {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
  display: block;
}

.monospace-font {
  font-family: monospace;
  font-size: 12px;
}

.quiz-config-card {
  background: #f8fafc;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.quiz-config-card h4 {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.teen-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 10px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.empty-admin-box, .empty-lessons-box {
  text-align: center;
  padding: 36px 20px;
  background: white;
  border-radius: 14px;
  border: 2px dashed #cbd5e1;
  color: #64748b;
}

.empty-admin-box i, .empty-lessons-box i {
  font-size: 36px;
  color: #94a3b8;
  margin-bottom: 10px;
  display: block;
}

.empty-admin-box h4 {
  font-size: 16px;
  color: #1e293b;
  margin-bottom: 6px;
}

.empty-admin-box p, .empty-lessons-box p {
  font-size: 13px;
  margin-bottom: 16px;
}
</style>
