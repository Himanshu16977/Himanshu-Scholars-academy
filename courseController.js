const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');

// @desc    Get all courses with search and filters
// @route   GET /api/courses
// @access  Public
const getCourses = async (req, res) => {
  try {
    const { search, category, level, sort } = req.query;
    let query = {};

    // Search by title or description
    if (search) {
      query.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Filter by Category
    if (category && category !== 'All') {
      query.category = category;
    }

    // Filter by Level
    if (level && level !== 'All Levels') {
      query.level = level;
    }

    // Filter by Instructor
    if (req.query.instructor) {
      query.instructor = req.query.instructor;
    }

    let queryBuilder = Course.find(query).populate('instructor', 'name email profileImage');

    // Sorting
    if (sort === 'price-low') {
      queryBuilder = queryBuilder.sort({ price: 1 });
    } else if (sort === 'price-high') {
      queryBuilder = queryBuilder.sort({ price: -1 });
    } else {
      queryBuilder = queryBuilder.sort({ createdAt: -1 });
    }

    const courses = await queryBuilder;

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error('Get Courses Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving courses',
    });
  }
};

// @desc    Get single course details
// @route   GET /api/courses/:id
// @access  Public
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate(
      'instructor',
      'name email phone profileImage'
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.error('Get Course By ID Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving course details',
    });
  }
};

// @desc    Create a new course
// @route   POST /api/courses
// @access  Private (Teacher, Admin)
const createCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      thumbnail,
      price,
      level,
      duration,
      lessons,
      instructorId,
    } = req.body;

    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide course title, description, and category',
      });
    }

    // Determine instructor: Admin can assign another teacher, otherwise defaults to current user
    const instructor =
      req.user.role === 'admin' && instructorId ? instructorId : req.user._id;

    const course = await Course.create({
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      thumbnail: thumbnail || undefined,
      price: price !== undefined ? Number(price) : 0,
      level: level || 'All Levels',
      duration: duration || '3 Months',
      instructor,
      lessons: Array.isArray(lessons) ? lessons : [],
    });

    const populatedCourse = await Course.findById(course._id).populate(
      'instructor',
      'name email profileImage'
    );

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: populatedCourse,
    });
  } catch (error) {
    console.error('Create Course Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating course',
    });
  }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Course Teacher Owner or Admin)
const updateCourse = async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Authorization: User must be course instructor or admin
    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to edit this course',
      });
    }

    const {
      title,
      description,
      category,
      thumbnail,
      price,
      level,
      duration,
      lessons,
    } = req.body;

    if (title) course.title = title.trim();
    if (description) course.description = description.trim();
    if (category) course.category = category.trim();
    if (thumbnail) course.thumbnail = thumbnail;
    if (price !== undefined) course.price = Number(price);
    if (level) course.level = level;
    if (duration) course.duration = duration;
    if (Array.isArray(lessons)) course.lessons = lessons;

    await course.save();

    const updated = await Course.findById(course._id).populate(
      'instructor',
      'name email profileImage'
    );

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update Course Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating course',
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Course Teacher Owner or Admin)
const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Authorization: User must be course instructor or admin
    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to delete this course',
      });
    }

    // Remove associated enrollments
    await Enrollment.deleteMany({ course: course._id });
    await course.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Course and associated enrollments deleted successfully',
    });
  } catch (error) {
    console.error('Delete Course Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting course',
    });
  }
};

// @desc    Add lesson to a course
// @route   POST /api/courses/:id/lessons
// @access  Private (Course Teacher Owner or Admin)
const addLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Authorization
    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to add lessons to this course',
      });
    }

    const { title, description, videoUrl, duration } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Please provide lesson title',
      });
    }

    const newLesson = {
      title: title.trim(),
      description: description ? description.trim() : '',
      videoUrl: videoUrl ? videoUrl.trim() : '',
      duration: duration || '45 mins',
      order: course.lessons.length + 1,
    };

    course.lessons.push(newLesson);
    await course.save();

    res.status(201).json({
      success: true,
      message: 'Lesson added successfully',
      data: course.lessons,
    });
  } catch (error) {
    console.error('Add Lesson Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error adding lesson',
    });
  }
};

// @desc    Update a lesson in a course
// @route   PUT /api/courses/:id/lessons/:lessonId
// @access  Private (Course Teacher Owner or Admin)
const updateLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to edit this lesson',
      });
    }

    const lesson = course.lessons.id(req.params.lessonId);
    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
      });
    }

    const { title, description, videoUrl, duration, order } = req.body;
    if (title) lesson.title = title.trim();
    if (description !== undefined) lesson.description = description.trim();
    if (videoUrl !== undefined) lesson.videoUrl = videoUrl.trim();
    if (duration !== undefined) lesson.duration = duration;
    if (order !== undefined) lesson.order = Number(order);

    await course.save();

    res.status(200).json({
      success: true,
      message: 'Lesson updated successfully',
      data: course.lessons,
    });
  } catch (error) {
    console.error('Update Lesson Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating lesson',
    });
  }
};

// @desc    Delete a lesson from a course
// @route   DELETE /api/courses/:id/lessons/:lessonId
// @access  Private (Course Teacher Owner or Admin)
const deleteLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to delete this lesson',
      });
    }

    course.lessons.pull({ _id: req.params.lessonId });
    await course.save();

    res.status(200).json({
      success: true,
      message: 'Lesson removed successfully',
      data: course.lessons,
    });
  } catch (error) {
    console.error('Delete Lesson Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error deleting lesson',
    });
  }
};

// @desc    Add a chapter to a course
// @route   POST /api/courses/:id/chapters
// @access  Private (Teacher Owner or Admin)
const addChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this course' });
    }

    const { title, description } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Chapter title is required' });

    course.chapters.push({
      title: title.trim(),
      description: description ? description.trim() : '',
      order: course.chapters.length + 1,
      lessons: [],
    });

    await course.save();

    res.status(201).json({
      success: true,
      message: 'Chapter added successfully',
      data: course.chapters,
    });
  } catch (error) {
    console.error('Add Chapter Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error adding chapter' });
  }
};

// @desc    Update a chapter
// @route   PUT /api/courses/:id/chapters/:chapterId
// @access  Private (Teacher Owner or Admin)
const updateChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ success: false, message: 'Chapter not found' });

    const { title, description, order } = req.body;
    if (title) chapter.title = title.trim();
    if (description !== undefined) chapter.description = description.trim();
    if (order !== undefined) chapter.order = Number(order);

    await course.save();
    res.status(200).json({ success: true, message: 'Chapter updated', data: course.chapters });
  } catch (error) {
    console.error('Update Chapter Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating chapter' });
  }
};

// @desc    Delete a chapter
// @route   DELETE /api/courses/:id/chapters/:chapterId
// @access  Private (Teacher Owner or Admin)
const deleteChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    course.chapters.pull({ _id: req.params.chapterId });
    await course.save();
    res.status(200).json({ success: true, message: 'Chapter deleted', data: course.chapters });
  } catch (error) {
    console.error('Delete Chapter Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error deleting chapter' });
  }
};

// @desc    Add a lesson to a specific chapter
// @route   POST /api/courses/:id/chapters/:chapterId/lessons
// @access  Private (Teacher Owner or Admin)
const addLessonToChapter = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ success: false, message: 'Chapter not found' });

    const { title, description, videoUrl, duration, resources } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Lesson title is required' });

    chapter.lessons.push({
      title: title.trim(),
      description: description ? description.trim() : '',
      videoUrl: videoUrl ? videoUrl.trim() : '',
      duration: duration || '45 mins',
      order: chapter.lessons.length + 1,
      resources: Array.isArray(resources) ? resources : [],
    });

    await course.save();
    res.status(201).json({ success: true, message: 'Lesson added to chapter', data: chapter.lessons });
  } catch (error) {
    console.error('Add Lesson to Chapter Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error adding lesson to chapter' });
  }
};

// @desc    Update a lesson inside a chapter
// @route   PUT /api/courses/:id/chapters/:chapterId/lessons/:lessonId
// @access  Private (Teacher Owner or Admin)
const updateChapterLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ success: false, message: 'Chapter not found' });

    const lesson = chapter.lessons.id(req.params.lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    const { title, description, videoUrl, duration, order, resources } = req.body;
    if (title) lesson.title = title.trim();
    if (description !== undefined) lesson.description = description.trim();
    if (videoUrl !== undefined) lesson.videoUrl = videoUrl.trim();
    if (duration !== undefined) lesson.duration = duration;
    if (order !== undefined) lesson.order = Number(order);
    if (Array.isArray(resources)) lesson.resources = resources;

    await course.save();
    res.status(200).json({ success: true, message: 'Lesson updated', data: chapter.lessons });
  } catch (error) {
    console.error('Update Chapter Lesson Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error updating lesson' });
  }
};

// @desc    Delete a lesson from a chapter
// @route   DELETE /api/courses/:id/chapters/:chapterId/lessons/:lessonId
// @access  Private (Teacher Owner or Admin)
const deleteChapterLesson = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const chapter = course.chapters.id(req.params.chapterId);
    if (!chapter) return res.status(404).json({ success: false, message: 'Chapter not found' });

    chapter.lessons.pull({ _id: req.params.lessonId });
    await course.save();
    res.status(200).json({ success: true, message: 'Lesson deleted from chapter', data: chapter.lessons });
  } catch (error) {
    console.error('Delete Chapter Lesson Error:', error.message);
    res.status(500).json({ success: false, message: 'Server error deleting lesson' });
  }
};

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  addLesson,
  updateLesson,
  deleteLesson,
  addChapter,
  updateChapter,
  deleteChapter,
  addLessonToChapter,
  updateChapterLesson,
  deleteChapterLesson,
};

