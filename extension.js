// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "leettutor" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    

    const createNotebook = vscode.commands.registerCommand('leettutor.createNotebook', async () => {
        try {
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    '**LeetTutor**',
                    'markdown'
                )
            ];

            const notebookData = new vscode.NotebookData(cells);
            notebookData.metadata = {
                kernelspec: {
                    display_name: "Python 3",
                    language: "python",
                    name: "python3"
                },
                language_info: {
                    name: "python",
                    version: "3.8.0"
                },
                custom: {
                    created_by: "leettutor_extension"
                }
            };

            const notebook = await vscode.workspace.openNotebookDocument('jupyter-notebook', notebookData);
            await vscode.window.showNotebookDocument(notebook);

            vscode.window.showInformationMessage('LeetCode analysis notebook created!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create notebook: ${error}`);
        }
    });

    context.subscriptions.push(createNotebook);

    const populateFromAPI = vscode.commands.registerCommand('leettutor.populateFromAPI', async () => {
        try {
            const activeEditor = vscode.window.activeNotebookEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active notebook found. Please open a notebook first.');
                return;
            }

            const input = await vscode.window.showInputBox({
                prompt: 'Enter LeetCode problem ID or slug (e.g., "1" or "two-sum")',
                placeHolder: 'two-sum'
            });

            if (!input) {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching LeetCode problem data...',
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ message: 'Fetching from external API...' });
                    const response = await fetch(`https://leetcode-api-pied.vercel.app/problem/${input}`);
                    if (!response.ok) {
                        throw new Error(`External API request failed: ${response.status}`);
                    }

                    const problemData = await response.json();


                    const notebook = activeEditor.notebook;
                    const edit = new vscode.WorkspaceEdit();

                    // Extract and parse stats
                    let statsData = null;
                    try {
                        if (problemData.stats) {
                            statsData = JSON.parse(problemData.stats);
                        } else if (leetcodeData?.stats) {
                            statsData = JSON.parse(leetcodeData.stats);
                        }
                    } catch (e) {
                        console.log('Failed to parse stats:', e);
                    }

                    // Extract problem description from HTML content
                    let cleanDescription = problemData.description || 'Problem description not available';
                    if (problemData.content) {
                        // Basic HTML to markdown conversion
                        cleanDescription = problemData.content
                            .replace(/<p>/g, '\n')
                            .replace(/<\/p>/g, '\n')
                            .replace(/<strong[^>]*>/g, '**')
                            .replace(/<\/strong>/g, '**')
                            .replace(/<em[^>]*>/g, '*')
                            .replace(/<\/em>/g, '*')
                            .replace(/<code[^>]*>/g, '`')
                            .replace(/<\/code>/g, '`')
                            .replace(/<pre[^>]*>/g, '\n```\n')
                            .replace(/<\/pre>/g, '\n```\n')
                            .replace(/<ul[^>]*>/g, '\n')
                            .replace(/<\/ul>/g, '\n')
                            .replace(/<li[^>]*>/g, '- ')
                            .replace(/<\/li>/g, '\n')
                            .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
                            .replace(/&nbsp;/g, ' ')
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                            .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up extra newlines
                            .trim();
                    }

                    // Parse similar questions
                    let similarQuestions = [];
                    try {
                        if (problemData.similarQuestions) {
                            similarQuestions = JSON.parse(problemData.similarQuestions);
                        } else if (leetcodeData?.similarQuestions) {
                            similarQuestions = JSON.parse(leetcodeData.similarQuestions);
                        }
                    } catch (e) {
                        console.log('Failed to parse similar questions:', e);
                    }

                    const titleCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `<font size="5"># ${problemData.title}\n**Difficulty:** ${problemData.difficulty} | **Tags:** ${problemData.topicTags?.map((tag) => tag.name).join(', ') || 'N/A'}</font>`,
                        'markdown'
                    );

                    const statsCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `<font size="3">**Stats:** ${statsData ? `${statsData.acRate} acceptance` : 'N/A'}${similarQuestions.length > 0 ? `\n\n**Similar:** ${similarQuestions.slice(0, 3).map(q => `[${q.title}](https://leetcode.com/problems/${q.titleSlug}/)`).join(' | ')}\n\n` : ''}</font>`,
                        'markdown'
                    );

                    const problemCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `<font size="3">**Problem:** ${cleanDescription}</font>`,
                        'markdown'
                    );

                    let codeTemplate = '# Write your solution here\n';
                    let hfDatasetData = null;

                    // Try external API codeSnippets first
                    if (problemData.codeSnippets) {
                        const pythonSnippet = problemData.codeSnippets.find((snippet) =>
                            snippet.lang === 'Python3' || snippet.lang === 'Python'
                        );
                        if (pythonSnippet) {
                            codeTemplate = pythonSnippet.code;
                        }
                    }

                    // Try Hugging Face LeetCode dataset if no external API code
                    if (codeTemplate === '# Write your solution here\n') {
                        try {
                            progress.report({ message: 'Fetching from Hugging Face dataset...' });

                            const searchTerms = [
                                input.toLowerCase().replace(/\s+/g, '-'),
                                problemData.titleSlug,
                                problemData.title?.toLowerCase().replace(/\s+/g, '-'),
                                `${problemData.questionFrontendId || problemData.questionId}`
                            ].filter(Boolean);

                            for (const searchTerm of searchTerms) {
                                try {
                                    const hfResponse = await fetch(`https://datasets-server.huggingface.co/search?dataset=newfacade/LeetCodeDataset&config=default&split=train&query=${encodeURIComponent(searchTerm)}&offset=0&length=10`);

                                    if (hfResponse.ok) {
                                        const hfResult = await hfResponse.json();
                                        const match = hfResult.rows?.find(row => {
                                            const rowData = row.row;
                                            return rowData.task_id === searchTerm ||
                                                   rowData.question_id?.toString() === searchTerm ||
                                                   rowData.task_id === input.toLowerCase().replace(/\s+/g, '-');
                                        });

                                        if (match) {
                                            hfDatasetData = match.row;
                                            if (hfDatasetData.starter_code) {
                                                codeTemplate = hfDatasetData.starter_code;
                                            }
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    console.log(`HF search failed for: ${searchTerm}`, e);
                                }
                            }

                            if (!hfDatasetData) {
                                const browseResponse = await fetch(`https://datasets-server.huggingface.co/rows?dataset=newfacade/LeetCodeDataset&config=default&split=train&offset=0&length=50`);
                                if (browseResponse.ok) {
                                    const browseResult = await browseResponse.json();
                                    const match = browseResult.rows?.find(row => {
                                        const rowData = row.row;
                                        return rowData.task_id?.includes(input.toLowerCase()) ||
                                               rowData.question_id?.toString() === (problemData.questionFrontendId || problemData.questionId)?.toString();
                                    });

                                    if (match) {
                                        hfDatasetData = match.row;
                                        if (hfDatasetData.starter_code) {
                                            codeTemplate = hfDatasetData.starter_code;
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.log('HF dataset fetch failed:', e);
                        }
                    }

                    // Analyze starter code for dependencies
                    let dependencyAnalysis = '';
                    let missingImports = [];
                    let predefinedCode = '';

                    if (codeTemplate && codeTemplate !== '# Write your solution here\n') {
                        // Check for common LeetCode types and imports
                        const typeChecks = [
                            { pattern: /List\[/g, import: 'from typing import List', description: 'List type annotation' },
                            { pattern: /Optional\[/g, import: 'from typing import Optional', description: 'Optional type annotation' },
                            { pattern: /Dict\[/g, import: 'from typing import Dict', description: 'Dict type annotation' },
                            { pattern: /Set\[/g, import: 'from typing import Set', description: 'Set type annotation' },
                            { pattern: /Tuple\[/g, import: 'from typing import Tuple', description: 'Tuple type annotation' },
                            { pattern: /Union\[/g, import: 'from typing import Union', description: 'Union type annotation' },
                            { pattern: /TreeNode/g, import: 'class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right', description: 'Binary tree node definition' },
                            { pattern: /ListNode/g, import: 'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next', description: 'Linked list node definition' },
                            { pattern: /Node/g, import: 'class Node:\n    def __init__(self, val=0, neighbors=None):\n        self.val = val\n        self.neighbors = neighbors if neighbors is not None else []', description: 'Generic node definition' },
                            { pattern: /collections\./g, import: 'import collections', description: 'Collections module' },
                            { pattern: /defaultdict/g, import: 'from collections import defaultdict', description: 'DefaultDict import' },
                            { pattern: /deque/g, import: 'from collections import deque', description: 'Deque import' },
                            { pattern: /Counter/g, import: 'from collections import Counter', description: 'Counter import' },
                            { pattern: /heapq\./g, import: 'import heapq', description: 'Heapq module' },
                            { pattern: /bisect\./g, import: 'import bisect', description: 'Bisect module' },
                            { pattern: /math\./g, import: 'import math', description: 'Math module' },
                            { pattern: /itertools\./g, import: 'import itertools', description: 'Itertools module' }
                        ];

                        const foundDependencies = [];
                        const neededImports = [];
                        const neededClasses = [];

                        typeChecks.forEach(check => {
                            if (check.pattern.test(codeTemplate)) {
                                foundDependencies.push(check.description);
                                if (check.import.startsWith('from') || check.import.startsWith('import')) {
                                    neededImports.push(check.import);
                                } else {
                                    neededClasses.push(check.import);
                                }
                            }
                        });

                        if (foundDependencies.length > 0) {
                            dependencyAnalysis = `# Dependencies found: ${foundDependencies.join(', ')}`;
                            predefinedCode = [...neededImports, '', ...neededClasses].join('\n').trim();
                        }
                    }

                    // Generate complete executable code
                    let completeCode = '';
                    if (predefinedCode) {
                        completeCode = `# Required imports and definitions\n${predefinedCode}\n\n${codeTemplate}`;
                        dependencyAnalysis += `\n# Predefined code added automatically`;
                    } else {
                        completeCode = codeTemplate;
                        dependencyAnalysis = '# No dependencies detected';
                    }

                    const codeCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        completeCode,
                        'python'
                    );

                    // Generate executable test cases
                    let testCasesContent = '';
                    let testCaseData = [];

                    if (hfDatasetData?.test) {
                        testCasesContent = hfDatasetData.test;
                    } else if (hfDatasetData?.input_output) {
                        // Parse HF dataset input/output format
                        try {
                            testCaseData = hfDatasetData.input_output;
                        } catch (e) {
                            console.log('Failed to parse HF test cases:', e);
                        }
                    } else if (problemData.exampleTestcases) {
                        // Parse external API test cases
                        try {
                            const lines = problemData.exampleTestcases.split('\n').filter(line => line.trim());
                            for (let i = 0; i < lines.length; i += 2) {
                                if (i + 1 < lines.length) {
                                    testCaseData.push({
                                        input: lines[i],
                                        output: lines[i + 1]
                                    });
                                }
                            }
                        } catch (e) {
                            console.log('Failed to parse external API test cases:', e);
                        }
                    }

                    // Generate executable test framework
                    if (!testCasesContent && testCaseData.length > 0) {
                        const functionName = hfDatasetData?.entry_point || 'solve';
                        const className = 'Solution';

                        testCasesContent = `# Automated test cases
def run_tests():
    solution = ${className}()
    test_cases = ${JSON.stringify(testCaseData, null, 4)}

    passed = 0
    total = len(test_cases)

    for i, test_case in enumerate(test_cases):
        try:
            inputs = test_case.get('input', '')
            expected = test_case.get('output', '')

            # Parse inputs (customize based on problem)
            if isinstance(inputs, str) and inputs.startswith('['):
                import ast
                parsed_inputs = ast.literal_eval(inputs)
                if isinstance(parsed_inputs, list) and len(parsed_inputs) >= 1:
                    if hasattr(solution, '${functionName}'):
                        if len(parsed_inputs) == 1:
                            result = solution.${functionName}(parsed_inputs[0])
                        elif len(parsed_inputs) == 2:
                            result = solution.${functionName}(parsed_inputs[0], parsed_inputs[1])
                        else:
                            result = solution.${functionName}(*parsed_inputs)
                    else:
                        result = solution.solve(*parsed_inputs) if len(parsed_inputs) > 1 else solution.solve(parsed_inputs[0])
                else:
                    result = solution.${functionName}(parsed_inputs) if hasattr(solution, '${functionName}') else solution.solve(parsed_inputs)
            else:
                result = solution.${functionName}(inputs) if hasattr(solution, '${functionName}') else solution.solve(inputs)

            # Parse expected output
            if isinstance(expected, str) and expected.startswith('['):
                import ast
                expected = ast.literal_eval(expected)

            if result == expected:
                print(f"Test {i+1}: PASS")
                passed += 1
            else:
                print(f"Test {i+1}: FAIL - Expected {expected}, got {result}")

        except Exception as e:
            print(f"Test {i+1}: ERROR - {str(e)}")

    print(f"\\nResults: {passed}/{total} tests passed")
    return passed == total

# Run tests after implementing your solution
# run_tests()`;
                    } else if (!testCasesContent) {
                        testCasesContent = `# Test cases
def run_tests():
    solution = Solution()
    # Add your test cases here
    test_cases = [
        # {"input": [2,7,11,15], "target": 9, "expected": [0,1]},
    ]

    for i, test in enumerate(test_cases):
        try:
            result = solution.solve(test["input"]) # Modify method name as needed
            expected = test["expected"]
            if result == expected:
                print(f"Test {i+1}: PASS")
            else:
                print(f"Test {i+1}: FAIL - Expected {expected}, got {result}")
        except Exception as e:
            print(f"Test {i+1}: ERROR - {str(e)}")

# run_tests()`;
                    }

                    const testCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        testCasesContent,
                        'python'
                    );

                    const analysisCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `<font size="3">**Analysis:** Time O() | Space O() | Approach: | Notes:</font>`,
                        'markdown'
                    );

                    // Determine template source
                    let templateSource = 'No starter code available';
                    if (problemData.codeSnippets) {
                        templateSource = 'External API';
                    } else if (hfDatasetData?.starter_code) {
                        templateSource = 'Hugging Face Dataset';
                    }

                    // Add test runner cell
                    const testRunnerCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `# Test Runner - Execute this cell to run all tests
def auto_run_tests():
    # Auto-detect method name from Solution class
    solution = Solution()
    methods = [method for method in dir(solution) if not method.startswith('_') and callable(getattr(solution, method))]

    if methods:
        main_method = methods[0]  # Use first public method
        print(f"Testing method: {main_method}")

        # Run the API-provided tests if available
        if 'run_tests' in globals():
            print("Running API-provided test cases...")
            run_tests()
        elif 'check' in globals():
            try:
                print("Running check function tests...")
                check(getattr(solution, main_method))
                print("All tests passed!")
            except AssertionError as e:
                print(f"Test failed: {e}")
            except Exception as e:
                print(f"Error running tests: {e}")
        else:
            print("No test cases available. Add test cases to run_tests() function or define check() function.")
    else:
        print("No public methods found in Solution class")

# Run tests automatically
auto_run_tests()`,
                        'python'
                    );

                    // Add dependency analysis cell if dependencies were found
                    const dependencyCell = predefinedCode ? new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `<font size="3">**Dependencies:** ${dependencyAnalysis.replace('# Dependencies found: ', '').replace('\n# Predefined code added automatically', ' (auto-added)')}</font>`,
                        'markdown'
                    ) : null;

                    const cells = dependencyCell ?
                        [titleCell, statsCell, problemCell, dependencyCell, codeCell, testCell, testRunnerCell, analysisCell] :
                        [titleCell, statsCell, problemCell, codeCell, testCell, testRunnerCell, analysisCell];
                    const cellCount = notebook.cellCount;
                    edit.set(
                        notebook.uri,
                        [vscode.NotebookEdit.insertCells(cellCount, cells)]
                    );

                    await vscode.workspace.applyEdit(edit);
                    const statusMessage = hfDatasetData ?
                        `Successfully populated notebook with problem: ${problemData.title} (External API + HF Dataset)` :
                        `Successfully populated notebook with problem: ${problemData.title} (External API only)`;
                    vscode.window.showInformationMessage(statusMessage);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to fetch problem data: ${error}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to populate from API: ${error}`);
        }
    });

    context.subscriptions.push(populateFromAPI);

    const populateDailyChallenge = vscode.commands.registerCommand('leettutor.populateDailyChallenge', async () => {
        try {
            const activeEditor = vscode.window.activeNotebookEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage('No active notebook found. Please open a notebook first.');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching today\'s LeetCode challenge...',
                cancellable: false
            }, async (progress) => {
                try {
                    const response = await fetch('https://leetcode-api-pied.vercel.app/daily');
                    if (!response.ok) {
                        throw new Error(`API request failed: ${response.status}`);
                    }

                    const dailyData = await response.json();

                    const notebook = activeEditor.notebook;
                    const edit = new vscode.WorkspaceEdit();

                    const headerCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Daily Challenge - ${new Date().toDateString()}\n\n## ${dailyData.title}\n\n**Difficulty:** ${dailyData.difficulty}\n\n**Problem Statement:**\n\n${dailyData.description || 'Problem description not available'}\n\n**Tags:** ${dailyData.topicTags?.map((tag) => tag.name).join(', ') || 'N/A'}`,
                        'markdown'
                    );

                    const codeTemplate = dailyData.codeSnippets?.find((snippet) =>
                        snippet.lang === 'Python3' || snippet.lang === 'Python'
                    )?.code || '# Write your solution here\n';

                    const codeCell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        codeTemplate,
                        'python'
                    );

                    const cellCount = notebook.cellCount;
                    edit.set(
                        notebook.uri,
                        [vscode.NotebookEdit.insertCells(cellCount, [headerCell, codeCell])]
                    );

                    await vscode.workspace.applyEdit(edit);
                    vscode.window.showInformationMessage(`Daily challenge loaded: ${dailyData.title}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to fetch daily challenge: ${error}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to populate daily challenge: ${error}`);
        }
    });

    context.subscriptions.push(populateDailyChallenge);


    

    

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('leettutor.welcomeShown', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Welcome to LeetTutor! Create a notebook and start solving problems with LeetCode data.',
            'Create Notebook',
            'Learn More'
        ).then(selection => {
            if (selection === 'Create Notebook') {
                vscode.commands.executeCommand('leettutor.createNotebook');
            }
        });
        context.globalState.update('leettutor.welcomeShown', true);
    }
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate
};