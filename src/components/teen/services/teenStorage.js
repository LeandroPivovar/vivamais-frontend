// Gerenciador de Armazenamento Local e Estado do Viva Mais Teen
import { DEFAULT_TEEN_COURSES, TEEN_ACHIEVEMENTS } from '../data/coursesData'

const STORAGE_COURSES_KEY = 'viva_teen_courses_db'
const STORAGE_PROGRESS_KEY = 'viva_teen_user_progress'

export const teenStorage = {
  // --- CARREGAMENTO E SALVAMENTO DE CURSOS ---
  getCourses() {
    try {
      const saved = localStorage.getItem(STORAGE_COURSES_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar cursos do localStorage, usando padrões:', e)
    }
    // Inicializa com os cursos padrão e salva
    this.saveCourses(DEFAULT_TEEN_COURSES)
    return JSON.parse(JSON.stringify(DEFAULT_TEEN_COURSES))
  },

  saveCourses(courses) {
    try {
      localStorage.setItem(STORAGE_COURSES_KEY, JSON.stringify(courses))
      window.dispatchEvent(new CustomEvent('teen-courses-updated', { detail: courses }))
    } catch (e) {
      console.error('Erro ao salvar cursos no localStorage:', e)
    }
  },

  resetToDefault() {
    this.saveCourses(DEFAULT_TEEN_COURSES)
    return JSON.parse(JSON.stringify(DEFAULT_TEEN_COURSES))
  },

  // --- CRUD DE CURSOS ---
  saveCourse(courseData) {
    const courses = this.getCourses()
    const index = courses.findIndex(c => c.id === courseData.id)
    if (index >= 0) {
      courses[index] = { ...courses[index], ...courseData }
    } else {
      const newCourse = {
        id: courseData.id || `course-${Date.now()}`,
        modules: [],
        materials: [],
        ...courseData
      }
      courses.push(newCourse)
    }
    this.saveCourses(courses)
    return courses
  },

  deleteCourse(courseId) {
    let courses = this.getCourses()
    courses = courses.filter(c => c.id !== courseId)
    this.saveCourses(courses)
    return courses
  },

  // --- CRUD DE MÓDULOS ---
  saveModule(courseId, moduleData) {
    const courses = this.getCourses()
    const course = courses.find(c => c.id === courseId)
    if (!course) return courses
    if (!course.modules) course.modules = []

    const mIndex = course.modules.findIndex(m => m.id === moduleData.id)
    if (mIndex >= 0) {
      course.modules[mIndex] = { ...course.modules[mIndex], ...moduleData }
    } else {
      course.modules.push({
        id: moduleData.id || `mod-${Date.now()}`,
        order: course.modules.length + 1,
        lessons: [],
        ...moduleData
      })
    }
    this.saveCourses(courses)
    return courses
  },

  deleteModule(courseId, moduleId) {
    const courses = this.getCourses()
    const course = courses.find(c => c.id === courseId)
    if (!course || !course.modules) return courses
    course.modules = course.modules.filter(m => m.id !== moduleId)
    this.saveCourses(courses)
    return courses
  },

  // --- CRUD DE AULAS ---
  saveLesson(courseId, moduleId, lessonData) {
    const courses = this.getCourses()
    const course = courses.find(c => c.id === courseId)
    if (!course || !course.modules) return courses
    const moduleItem = course.modules.find(m => m.id === moduleId)
    if (!moduleItem) return courses
    if (!moduleItem.lessons) moduleItem.lessons = []

    const lIndex = moduleItem.lessons.findIndex(l => l.id === lessonData.id)
    if (lIndex >= 0) {
      moduleItem.lessons[lIndex] = { ...moduleItem.lessons[lIndex], ...lessonData }
    } else {
      moduleItem.lessons.push({
        id: lessonData.id || `les-${Date.now()}`,
        vocabulary: [],
        ...lessonData
      })
    }
    this.saveCourses(courses)
    return courses
  },

  deleteLesson(courseId, moduleId, lessonId) {
    const courses = this.getCourses()
    const course = courses.find(c => c.id === courseId)
    if (!course || !course.modules) return courses
    const moduleItem = course.modules.find(m => m.id === moduleId)
    if (!moduleItem || !moduleItem.lessons) return courses
    moduleItem.lessons = moduleItem.lessons.filter(l => l.id !== lessonId)
    this.saveCourses(courses)
    return courses
  },

  // --- CRUD DE MATERIAIS ---
  saveMaterial(courseId, materialData) {
    const courses = this.getCourses()
    const course = courses.find(c => c.id === courseId)
    if (!course) return courses
    if (!course.materials) course.materials = []

    const matIndex = course.materials.findIndex(m => m.id === materialData.id)
    if (matIndex >= 0) {
      course.materials[matIndex] = { ...course.materials[matIndex], ...materialData }
    } else {
      course.materials.push({
        id: materialData.id || `mat-${Date.now()}`,
        downloadUrl: materialData.downloadUrl || '#',
        ...materialData
      })
    }
    this.saveCourses(courses)
    return courses
  },

  deleteMaterial(courseId, materialId) {
    const courses = this.getCourses()
    const course = courses.find(c => c.id === courseId)
    if (!course || !course.materials) return courses
    course.materials = course.materials.filter(m => m.id !== materialId)
    this.saveCourses(courses)
    return courses
  },

  // --- GESTÃO DE PROGRESSO DO ALUNO & GAMIFICAÇÃO ---
  getProgress(userId = 'default_teen') {
    try {
      const saved = localStorage.getItem(`${STORAGE_PROGRESS_KEY}_${userId}`)
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Erro ao carregar progresso teen:', e)
    }
    return {
      completedLessons: ['les-en-1-1'], // Inicial com 1 aula concluída
      xp: 280,
      streakDays: 4,
      level: 'Nível 3 (Explorer)',
      notes: {},
      achievements: TEEN_ACHIEVEMENTS
    }
  },

  saveProgress(userId = 'default_teen', progressData) {
    try {
      localStorage.setItem(`${STORAGE_PROGRESS_KEY}_${userId}`, JSON.stringify(progressData))
      window.dispatchEvent(new CustomEvent('teen-progress-updated', { detail: progressData }))
    } catch (e) {
      console.error('Erro ao salvar progresso:', e)
    }
  },

  toggleLessonComplete(userId = 'default_teen', lessonId, xpGain = 50) {
    const progress = this.getProgress(userId)
    const list = progress.completedLessons || []
    const isCompleted = list.includes(lessonId)

    if (isCompleted) {
      progress.completedLessons = list.filter(id => id !== lessonId)
      progress.xp = Math.max(0, (progress.xp || 0) - xpGain)
    } else {
      progress.completedLessons = [...list, lessonId]
      progress.xp = (progress.xp || 0) + xpGain
      // Checa conquista primeira aula
      const firstAch = progress.achievements?.find(a => a.id === 'first_lesson')
      if (firstAch) firstAch.unlocked = true
    }

    this.saveProgress(userId, progress)
    return { isCompleted: !isCompleted, xp: progress.xp, completedLessons: progress.completedLessons }
  },

  saveLessonNote(userId = 'default_teen', lessonId, noteText) {
    const progress = this.getProgress(userId)
    if (!progress.notes) progress.notes = {}
    progress.notes[lessonId] = noteText
    
    // Desbloqueia conquista de anotações
    const noteAch = progress.achievements?.find(a => a.id === 'note_taker')
    if (noteAch && noteText.trim().length > 5) {
      noteAch.unlocked = true
    }

    this.saveProgress(userId, progress)
    return progress
  }
}
