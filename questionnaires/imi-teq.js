WebSpheresQuestionnaires.define({
    id: 'IMI-TEQ',
    version: 1,
    name: 'IMI Task Evaluation Questionnaire',
    title: 'About the task',
    type: 'scale',
    instructions: 'For each statement, choose how true it is for you, from 1 (not at all true) to 7 (very true).',
    scale: {
        values: [1, 2, 3, 4, 5, 6, 7],
        labels: ['Not at all true', '', '', 'Somewhat true', '', '', 'Very true'],
        showNumbers: true
    },
    items: [
        { id: 'TEQ01', text: 'While I was working on the task, I was thinking about how much I enjoyed it.' },
        { id: 'TEQ02', text: 'I did not feel at all nervous about doing the task.', reverse: true },
        { id: 'TEQ03', text: 'I felt that it was my choice to do the task.' },
        { id: 'TEQ04', text: 'I think I am pretty good at this task.' },
        { id: 'TEQ05', text: 'I found the task very interesting.' },
        { id: 'TEQ06', text: 'I felt tense while doing the task.' },
        { id: 'TEQ07', text: 'I think I did pretty well compared to other people.' },
        { id: 'TEQ08', text: 'Doing the task was fun.' },
        { id: 'TEQ09', text: 'I felt relaxed while doing the task.', reverse: true },
        { id: 'TEQ10', text: 'I enjoyed doing the task very much.' },
        { id: 'TEQ11', text: 'I didn’t really have a choice about doing the task.', reverse: true },
        { id: 'TEQ12', text: 'I am satisfied with my performance at this task.' },
        { id: 'TEQ13', text: 'I was anxious while doing the task.' },
        { id: 'TEQ14', text: 'I thought the task was very boring.', reverse: true },
        { id: 'TEQ15', text: 'I felt like I was doing what I wanted to do while I was working on the task.' },
        { id: 'TEQ16', text: 'I felt pretty skilled at this task.' },
        { id: 'TEQ17', text: 'I thought this task was very interesting.' },
        { id: 'TEQ18', text: 'I felt pressured while doing the task.' },
        { id: 'TEQ19', text: 'I felt like I had to do the task.', reverse: true },
        { id: 'TEQ20', text: 'I would describe the task as very enjoyable.' },
        { id: 'TEQ21', text: 'I did the task because I had no choice.', reverse: true },
        { id: 'TEQ22', text: 'After working at this task for a while, I felt pretty competent.' }
    ],
    scores: [
        { id: 'TEQ_InterestEnjoyment', label: 'Interest/enjoyment', method: 'mean', items: ['TEQ01', 'TEQ05', 'TEQ08', 'TEQ10', 'TEQ14', 'TEQ17', 'TEQ20'] },
        { id: 'TEQ_PerceivedCompetence', label: 'Perceived competence', method: 'mean', items: ['TEQ04', 'TEQ07', 'TEQ12', 'TEQ16', 'TEQ22'] },
        { id: 'TEQ_PerceivedChoice', label: 'Perceived choice', method: 'mean', items: ['TEQ03', 'TEQ11', 'TEQ15', 'TEQ19', 'TEQ21'] },
        { id: 'TEQ_PressureTension', label: 'Pressure/tension', method: 'mean', items: ['TEQ02', 'TEQ06', 'TEQ09', 'TEQ13', 'TEQ18'] }
    ]
});
