// Gerenciador de Armazenamento Local e Estado do Viva Mais Teen (Aulas Ao Vivo & Presença)
import { DEFAULT_TEEN_COURSES, TEEN_CHAT_FALLBACK, TEEN_LIVE_PARTICIPANTS_FALLBACK } from '../data/coursesData'

const STORAGE_COURSES_KEY = 'viva_teen_courses_db'
const STORAGE_PROGRESS_KEY = 'viva_teen_user_progress'
const STORAGE_ATTENDANCE_KEY = 'viva_teen_user_attendance'
const STORAGE_CHAT_KEY = 'viva_teen_live_chat'

function cloneDefaultCourses() {
  return JSON.parse(JSON.stringify(DEFAULT_TEEN_COURSES))
}

function isLegacyMockCourseSet(courses) {
  return courses.some(course => String(course?.id || '').startsWith('course-teen-'))
}

export const teenStorage = {
  // --- CARREGAMENTO E SALVAMENTO DE CURSOS ---
  getCourses() {
    try {
      const saved = localStorage.getItem(STORAGE_COURSES_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (isLegacyMockCourseSet(parsed)) return []
          return parsed
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar cursos do localStorage:', e)
    }
    return cloneDefaultCourses()
  },

  saveCourses(courses) {
    try {
      localStorage.setItem(STORAGE_COURSES_KEY, JSON.stringify(courses || []))
      window.dispatchEvent(new CustomEvent('teen-courses-updated', { detail: courses || [] }))
    } catch (e) {
      console.error('Erro ao salvar cursos no localStorage:', e)
    }
  },

  resetToDefault() {
    const defaults = cloneDefaultCourses()
    this.saveCourses(defaults)
    return defaults
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

  // --- CRUD DE AULAS AO VIVO ---
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
        status: lessonData.status || 'agendada',
        liveDate: lessonData.liveDate || '2026-08-20T19:00',
        formattedDate: lessonData.formattedDate || '20/08 às 19:00',
        viewersCount: lessonData.viewersCount || 0,
        materials: [],
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

  // --- PRESENÇA / CHECK-IN NAS AULAS AO VIVO ---
  getAttendance(userId = 'default_teen') {
    try {
      const saved = localStorage.getItem(`${STORAGE_ATTENDANCE_KEY}_${userId}`)
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Erro ao ler presenças:', e)
    }
    return []
  },

  hasAttended(userId = 'default_teen', lessonId) {
    const list = this.getAttendance(userId)
    return list.includes(lessonId)
  },

  markAttendance(userId = 'default_teen', lessonId, userName = 'Você') {
    let list = this.getAttendance(userId)
    const alreadyAttended = list.includes(lessonId)
    if (!alreadyAttended) {
      list.push(lessonId)
      localStorage.setItem(`${STORAGE_ATTENDANCE_KEY}_${userId}`, JSON.stringify(list))
      
      // Adiciona mensagem automática no chat de presença
      this.addChatMessage(lessonId, {
        author: userName,
        role: 'student',
        avatar: '🎓',
        text: `✋ Marcou presença na aula ao vivo!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })

      window.dispatchEvent(new CustomEvent('teen-attendance-updated', { detail: { userId, lessonId, list } }))
    }
    return { attended: true, list }
  },

  unmarkAttendance(userId = 'default_teen', lessonId) {
    let list = this.getAttendance(userId)
    list = list.filter(id => id !== lessonId)
    localStorage.setItem(`${STORAGE_ATTENDANCE_KEY}_${userId}`, JSON.stringify(list))
    window.dispatchEvent(new CustomEvent('teen-attendance-updated', { detail: { userId, lessonId, list } }))
    return { attended: false, list }
  },

  // --- CHAT AO VIVO DA AULA ---
  getChatMessages(lessonId = '') {
    try {
      const saved = localStorage.getItem(`${STORAGE_CHAT_KEY}_${lessonId}`)
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Erro ao ler chat:', e)
    }
    return [...TEEN_CHAT_FALLBACK]
  },

  addChatMessage(lessonId, messageObj) {
    const msgs = this.getChatMessages(lessonId)
    const newMsg = {
      id: `msg-${Date.now()}`,
      author: messageObj.author || 'Estudante',
      role: messageObj.role || 'student',
      avatar: messageObj.avatar || '🎓',
      text: messageObj.text || '',
      time: messageObj.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    msgs.push(newMsg)
    try {
      localStorage.setItem(`${STORAGE_CHAT_KEY}_${lessonId}`, JSON.stringify(msgs))
      window.dispatchEvent(new CustomEvent('teen-chat-updated', { detail: { lessonId, messages: msgs } }))
    } catch (e) {
      console.error('Erro ao salvar chat:', e)
    }
    return msgs
  },

  getLiveParticipants(lessonId = '') {
    return [...TEEN_LIVE_PARTICIPANTS_FALLBACK]
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
      completedLessons: [],
      xp: 0,
      streakDays: 0,
      level: 'Nivel 1'
    }
  },

  saveProgress(userId = 'default_teen', progressData) {
    try {
      localStorage.setItem(`${STORAGE_PROGRESS_KEY}_${userId}`, JSON.stringify(progressData))
      window.dispatchEvent(new CustomEvent('teen-progress-updated', { detail: progressData }))
    } catch (e) {
      console.error('Erro ao salvar progresso:', e)
    }
  }
}
